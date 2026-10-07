export default async function handler(req, res) {
  const { id } = req.query

  if (!/^\d+$/.test(id ?? '')) {
    res.status(400).json({ error: 'Invalid league id' })
    return
  }

  try {
    const fplRes = await fetch(
      `https://fantasy.premierleague.com/api/leagues-classic/${id}/standings/`,
    )

    if (!fplRes.ok) {
      res.status(fplRes.status).json({ error: `FPL API returned ${fplRes.status}` })
      return
    }

    const data = await fplRes.json()
    // Cache at the edge so repeat page loads don't hit FPL directly, and keep
    // serving the last good response for a day if FPL's API starts erroring.
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600, stale-if-error=86400')
    res.status(200).json(data)
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach FPL API' })
  }
}
