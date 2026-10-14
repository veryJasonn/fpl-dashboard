export default async function handler(req, res) {
  try {
    const fplRes = await fetch('https://fantasy.premierleague.com/api/bootstrap-static/')
    if (!fplRes.ok) {
      res.status(fplRes.status).json({ error: `FPL API returned ${fplRes.status}` })
      return
    }
    const data = await fplRes.json()

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300, stale-if-error=86400')
    res.status(200).json({
      events: data.events.map((e) => ({
        id: e.id,
        name: e.name,
        deadline: e.deadline_time,
        finished: e.finished,
        current: e.is_current,
        next: e.is_next,
      })),
      chips: data.chips.map((c) => ({ name: c.name, start: c.start_event, stop: c.stop_event })),
    })
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach FPL API' })
  }
}
