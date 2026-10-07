export default async function handler(req, res) {
  const { id } = req.query

  if (!/^\d+$/.test(id ?? '')) {
    res.status(400).json({ error: 'Invalid entry id' })
    return
  }

  try {
    const fplRes = await fetch(`https://fantasy.premierleague.com/api/entry/${id}/history/`)

    if (!fplRes.ok) {
      res.status(fplRes.status).json({ error: `FPL API returned ${fplRes.status}` })
      return
    }

    const data = await fplRes.json()
    res.status(200).json(data)
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach FPL API' })
  }
}
