// Prints the facts needed to write the weekly recap in src/summary.json.
// Usage: node scripts/recap-facts.mjs [gameweek]   (defaults to the latest fully finished gameweek)
const FPL = 'https://fantasy.premierleague.com/api'
const LEAGUE_ID = 1187651
const get = async (path) => {
  const res = await fetch(FPL + path)
  if (!res.ok) throw new Error(`${res.status} for ${path}`)
  return res.json()
}

const bootstrap = await get('/bootstrap-static/')
const checked = bootstrap.events.filter((e) => e.data_checked)
const GW = Number(process.argv[2] ?? checked.at(-1)?.id)
if (!GW) throw new Error('No fully finished gameweek yet')

const [standings, live] = await Promise.all([get(`/leagues-classic/${LEAGUE_ID}/standings/`), get(`/event/${GW}/live/`)])
const name = new Map(bootstrap.elements.map((e) => [e.id, e.web_name]))
const pts = new Map(live.elements.map((e) => [e.id, e.stats.total_points]))

const rows = []
for (const e of standings.standings.results) {
  const [hist, picks] = await Promise.all([get(`/entry/${e.entry}/history/`), get(`/entry/${e.entry}/event/${GW}/picks/`)])
  const net = (g) => g.points - g.event_transfers_cost
  const upTo = (n) => hist.current.filter((g) => g.event <= n).reduce((s, g) => s + net(g), 0)
  const cap = picks.picks.find((p) => p.is_captain)
  const xi = picks.picks.filter((p) => p.multiplier > 0)
  const best = [...xi].sort((a, b) => pts.get(b.element) * b.multiplier - pts.get(a.element) * a.multiplier)[0]
  const g = hist.current.find((x) => x.event === GW)
  rows.push({
    manager: e.player_name,
    team: e.entry_name,
    gwPoints: net(g),
    totalBefore: upTo(GW - 1),
    totalAfter: upTo(GW),
    transfers: g.event_transfers,
    transferHit: g.event_transfers_cost,
    pointsOnBench: g.points_on_bench,
    chip: picks.active_chip,
    captain: `${name.get(cap.element)} (${pts.get(cap.element)} pts, x${cap.multiplier})`,
    bestPlayer: `${name.get(best.element)} (${pts.get(best.element) * best.multiplier} pts counted)`,
    autoSubs: picks.automatic_subs.map((s) => `${name.get(s.element_out)} -> ${name.get(s.element_in)}`),
    gwPointsHistory: hist.current.map(net),
  })
}

const rankBy = (key) => Object.fromEntries([...rows].sort((a, b) => b[key] - a[key]).map((r, i) => [r.manager, i + 1]))
const before = rankBy('totalBefore')
const after = rankBy('totalAfter')
const average = rows.reduce((s, r) => s + r.gwPoints, 0) / rows.length
for (const r of rows) {
  r.rankBefore = before[r.manager]
  r.rankAfter = after[r.manager]
}

console.log(JSON.stringify({ gameweek: GW, leagueAverage: +average.toFixed(1), rows: rows.sort((a, b) => a.rankAfter - b.rankAfter) }, null, 2))
