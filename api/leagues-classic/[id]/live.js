const FPL = 'https://fantasy.premierleague.com/api'

const MIN_IN_XI = { 1: 1, 2: 3, 3: 2, 4: 1 } // GK, DEF, MID, FWD

async function fplJson(path) {
  const res = await fetch(`${FPL}${path}`)
  if (!res.ok) {
    const err = new Error(`FPL API returned ${res.status} for ${path}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

function validFormation(xi) {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 }
  for (const p of xi) counts[p.element_type] += 1
  return Object.entries(MIN_IN_XI).every(([type, min]) => counts[type] >= min) && counts[1] === 1
}

// info(element) -> { points, out }, where `out` means the player has 0 minutes and
// every fixture their team has this gameweek is over, so they can no longer play.
export function computeEntryPoints({ picks, activeChip, transfersCost, info }) {
  const squad = [...picks].sort((a, b) => a.position - b.position)
  const capMult = activeChip === '3xc' ? 3 : 2

  let counted
  let subs = []
  if (activeChip === 'bboost') {
    counted = squad
  } else {
    const xi = squad.slice(0, 11)
    const bench = squad.slice(11)
    const usedBench = new Set()
    for (let i = 0; i < xi.length; i += 1) {
      const outPlayer = xi[i]
      if (!info(outPlayer.element).out) continue
      for (const candidate of bench) {
        if (usedBench.has(candidate.element)) continue
        if (info(candidate.element).out) continue
        if ((outPlayer.element_type === 1) !== (candidate.element_type === 1)) continue
        const next = xi.slice()
        next[i] = candidate
        if (!validFormation(next)) continue
        xi[i] = candidate
        usedBench.add(candidate.element)
        subs.push({ in: candidate.element, out: outPlayer.element })
        break
      }
    }
    counted = xi
  }

  const captain = squad.find((p) => p.is_captain)
  const vice = squad.find((p) => p.is_vice_captain)
  let armband = null
  if (captain && !info(captain.element).out) armband = captain.element
  else if (vice && !info(vice.element).out) armband = vice.element

  const gross = counted.reduce(
    (sum, p) => sum + info(p.element).points * (p.element === armband ? capMult : 1),
    0,
  )

  return { points: gross - transfersCost, gross, subs }
}

export default async function handler(req, res) {
  const { id } = req.query

  if (!/^\d+$/.test(id ?? '')) {
    res.status(400).json({ error: 'Invalid league id' })
    return
  }

  try {
    const bootstrap = await fplJson('/bootstrap-static/')

    // Only honoured outside production, to preview live mode on a finished gameweek.
    const forced = process.env.NODE_ENV !== 'production' ? Number(req.query.forceEvent) : NaN
    const current = bootstrap.events.find((e) => e.is_current)
    const event = Number.isInteger(forced)
      ? bootstrap.events.find((e) => e.id === forced)
      : current && !current.data_checked
        ? current
        : null

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=60, stale-if-error=3600')

    if (!event) {
      res.status(200).json({ event: null, live: false, entries: {} })
      return
    }

    const [liveData, fixtures, standings] = await Promise.all([
      fplJson(`/event/${event.id}/live/`),
      fplJson(`/fixtures/?event=${event.id}`),
      fplJson(`/leagues-classic/${id}/standings/`),
    ])

    const liveById = new Map(liveData.elements.map((el) => [el.id, el.stats]))
    const teamOfElement = new Map(bootstrap.elements.map((el) => [el.id, el.team]))
    const teamDone = new Map(bootstrap.teams.map((t) => [t.id, true]))
    for (const f of fixtures) {
      if (!(f.finished || f.finished_provisional)) {
        teamDone.set(f.team_h, false)
        teamDone.set(f.team_a, false)
      }
    }

    const info = (element) => {
      const stats = liveById.get(element)
      const minutes = stats?.minutes ?? 0
      return {
        points: stats?.total_points ?? 0,
        out: minutes === 0 && (teamDone.get(teamOfElement.get(element)) ?? false),
      }
    }

    const entryIds = standings.standings.results.map((r) => r.entry)
    const entries = {}
    await Promise.all(
      entryIds.map(async (entryId) => {
        let data
        try {
          data = await fplJson(`/entry/${entryId}/event/${event.id}/picks/`)
        } catch (err) {
          if (err.status === 404) return
          throw err
        }
        const { points } = computeEntryPoints({
          picks: data.picks,
          activeChip: data.active_chip,
          transfersCost: data.entry_history.event_transfers_cost,
          info,
        })
        entries[entryId] = { points, chip: data.active_chip, transfers: data.entry_history.event_transfers }
      }),
    )

    res.status(200).json({ event: event.id, live: Number.isInteger(forced) ? true : !event.finished, entries })
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach FPL API' })
  }
}
