import { cachedFplJson, fplJson } from '../../_lib/fpl.js'

const MIN_IN_XI = { 1: 1, 2: 3, 3: 2, 4: 1 } // GK, DEF, MID, FWD

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

  const inXi = new Set(counted.map((p) => p.element))
  return {
    points: gross - transfersCost,
    gross,
    subs,
    xi: counted,
    bench: squad.filter((p) => !inXi.has(p.element)),
    armband,
    capMult,
  }
}

export default async function handler(req, res) {
  const { id } = req.query

  if (!/^\d+$/.test(id ?? '')) {
    res.status(400).json({ error: 'Invalid league id' })
    return
  }

  try {
    const bootstrap = await cachedFplJson('/bootstrap-static/')

    // Only honoured outside production, to preview live mode on a finished gameweek.
    const forced = process.env.NODE_ENV !== 'production' ? Number(req.query.forceEvent) : NaN
    // Defaults to the current gameweek; ?event=N returns the squads for any gameweek already started.
    const current = bootstrap.events.find((e) => e.is_current)
    const requested = Number(req.query.event)
    const event = Number.isInteger(forced)
      ? bootstrap.events.find((e) => e.id === forced)
      : Number.isInteger(requested) && current && requested >= 1 && requested <= current.id
        ? bootstrap.events.find((e) => e.id === requested)
        : current
    const live = Number.isInteger(forced) ? true : Boolean(event && !event.finished)
    const isPast = Boolean(event && current && event.id < current.id)

    res.setHeader(
      'Cache-Control',
      live
        ? 'public, s-maxage=60, stale-while-revalidate=60, stale-if-error=3600'
        : isPast
          ? 'public, s-maxage=86400, stale-while-revalidate=86400, stale-if-error=86400'
          : 'public, s-maxage=600, stale-while-revalidate=600, stale-if-error=3600',
    )

    if (!event) {
      res.status(200).json({ event: null, live: false, entries: {} })
      return
    }

    const [liveData, fixtures, standings] = await Promise.all([
      fplJson(`/event/${event.id}/live/`),
      fplJson(`/fixtures/?event=${event.id}`),
      cachedFplJson(`/leagues-classic/${id}/standings/`),
    ])

    const liveById = new Map(liveData.elements.map((el) => [el.id, el.stats]))
    const teamOfElement = new Map(bootstrap.elements.map((el) => [el.id, el.team]))
    const nameOfElement = new Map(bootstrap.elements.map((el) => [el.id, el.web_name]))
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
        const result = computeEntryPoints({
          picks: data.picks,
          activeChip: data.active_chip,
          transfersCost: data.entry_history.event_transfers_cost,
          info,
        })

        // Once FPL has processed the gameweek it has already applied the subs to the picks.
        const subs = result.subs.length
          ? result.subs
          : (data.automatic_subs ?? []).map((s) => ({ in: s.element_in, out: s.element_out }))
        const subbedIn = new Set(subs.map((s) => s.in))
        const subbedOut = new Set(subs.map((s) => s.out))
        const player = (p, counted) => ({
          id: p.element,
          name: nameOfElement.get(p.element) ?? `#${p.element}`,
          type: p.element_type,
          points: liveById.get(p.element)?.total_points ?? 0,
          minutes: liveById.get(p.element)?.minutes ?? 0,
          multiplier: counted ? (p.element === result.armband ? result.capMult : 1) : 0,
          captain: p.element === result.armband,
          vice: Boolean(p.is_vice_captain) && p.element !== result.armband,
          subbedIn: subbedIn.has(p.element),
          subbedOut: subbedOut.has(p.element),
        })
        const byTypeThenSlot = (a, b) => a.element_type - b.element_type || a.position - b.position

        entries[entryId] = {
          points: result.points,
          chip: data.active_chip,
          transfers: data.entry_history.event_transfers,
          hit: data.entry_history.event_transfers_cost,
          squad: {
            xi: [...result.xi].sort(byTypeThenSlot).map((p) => player(p, true)),
            bench: result.bench.map((p) => player(p, false)),
          },
        }
      }),
    )

    res.status(200).json({ event: event.id, live, entries })
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach FPL API' })
  }
}
