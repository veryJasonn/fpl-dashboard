import { cachedFplJson, fplJson } from '../../_lib/fpl.js'

// Everything the page needs to start: league standings, every manager's gameweek history and chips,
// plus gameweek deadlines and chip windows. One request instead of ~8, trimmed to the fields the page uses.
export default async function handler(req, res) {
  const { id } = req.query

  if (!/^\d+$/.test(id ?? '')) {
    res.status(400).json({ error: 'Invalid league id' })
    return
  }

  try {
    const [standings, bootstrap] = await Promise.all([
      cachedFplJson(`/leagues-classic/${id}/standings/`),
      cachedFplJson('/bootstrap-static/'),
    ])
    const entries = standings.standings.results
    const histories = await Promise.all(entries.map((e) => fplJson(`/entry/${e.entry}/history/`)))

    // Cache at the edge so repeat page loads don't hit FPL, and keep serving the last good copy
    // for a day if FPL's API starts erroring.
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600, stale-if-error=86400')
    res.status(200).json({
      leagueName: standings.league.name,
      entries: entries.map((e, i) => ({
        id: e.entry,
        rank: e.rank,
        manager: e.player_name,
        team: e.entry_name,
        total: e.total,
        gameweeks: histories[i].current.map((g) => ({
          event: g.event,
          points: g.points,
          transfers: g.event_transfers,
          cost: g.event_transfers_cost,
          bench: g.points_on_bench,
        })),
        chips: histories[i].chips.map((c) => ({ name: c.name, event: c.event })),
      })),
      events: bootstrap.events.map((e) => ({ id: e.id, name: e.name, deadline: e.deadline_time })),
      chips: bootstrap.chips.map((c) => ({ name: c.name, start: c.start_event, stop: c.stop_event })),
    })
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach FPL API' })
  }
}
