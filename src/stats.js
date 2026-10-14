import { CHIP_CODES } from './chips.js'

export const CHIP_ORDER = ['WC', 'FH', 'BB', 'TC']
const CODE_TO_NAME = Object.fromEntries(Object.entries(CHIP_CODES).map(([name, code]) => [code, name]))

const sum = (values) => values.reduce((total, v) => total + v, 0)

export function totalsThrough(rows, gw) {
  return new Map(rows.map((row) => [row.id, sum(Object.entries(row.gwPoints).filter(([e]) => Number(e) <= gw).map(([, p]) => p))]))
}

// Competition ranking: equal totals share a rank (1, 2, 2, 4).
export function competitionRanks(totals) {
  return new Map([...totals].map(([id, t]) => [id, 1 + [...totals.values()].filter((o) => o > t).length]))
}

// id -> places climbed since the previous gameweek (negative = dropped).
export function rankMoves(rows, gameweeks) {
  if (gameweeks.length < 2) return new Map()
  const latest = gameweeks[gameweeks.length - 1]
  const previous = gameweeks[gameweeks.length - 2]
  const now = competitionRanks(totalsThrough(rows, latest))
  const before = competitionRanks(totalsThrough(rows, previous))
  return new Map(rows.map((row) => [row.id, before.get(row.id) - now.get(row.id)]))
}

// Chips for the half of the season we are in: used ones are marked, the rest are still to play.
export function chipStatus(row, chips, event) {
  return CHIP_ORDER.map((code) => {
    const name = CODE_TO_NAME[code]
    const windows = chips.filter((c) => c.name === name).sort((a, b) => a.start - b.start)
    const window = windows.find((w) => w.start <= event && event <= w.stop) ?? windows.find((w) => w.start > event)
    if (!window) return { code, used: false, usedAt: null, open: false }
    const usedAt = Object.entries(row.chipsByEvent).find(([e, c]) => c === code && Number(e) >= window.start && Number(e) <= window.stop)?.[0]
    return { code, used: usedAt !== undefined, usedAt: usedAt === undefined ? null : Number(usedAt), open: window.start <= event }
  })
}

export function seasonTotals(row) {
  return {
    transfers: sum(Object.values(row.transfers ?? {})),
    hits: sum(Object.values(row.hits ?? {})),
    bench: sum(Object.values(row.bench ?? {})),
  }
}

function extremes(items, score, pick) {
  if (items.length === 0) return null
  const best = pick(...items.map(score))
  return { value: best, items: items.filter((i) => score(i) === best) }
}

export function awards(rows, gameweeks, moves) {
  const weeks = rows.flatMap((row) =>
    gameweeks.filter((gw) => row.gwPoints[gw] !== undefined).map((gw) => ({ manager: row.manager, gw, points: row.gwPoints[gw] })),
  )
  const totals = rows.map((row) => ({ manager: row.manager, ...seasonTotals(row), move: moves.get(row.id) ?? 0 }))
  const list = []

  const best = extremes(weeks, (w) => w.points, Math.max)
  if (best) list.push({ key: 'best', title: 'Best week', value: `${best.value} pts`, winners: best.items.map((w) => ({ manager: w.manager, note: `GW${w.gw}` })) })
  const worst = extremes(weeks, (w) => w.points, Math.min)
  if (worst) list.push({ key: 'worst', title: 'Worst week', value: `${worst.value} pts`, winners: worst.items.map((w) => ({ manager: w.manager, note: `GW${w.gw}` })) })

  const climber = extremes(totals, (t) => t.move, Math.max)
  if (climber && climber.value > 0) list.push({ key: 'climber', title: 'Biggest climber', value: `▲${climber.value}`, winners: climber.items.map((t) => ({ manager: t.manager, note: 'latest week' })) })
  const faller = extremes(totals, (t) => t.move, Math.min)
  if (faller && faller.value < 0) list.push({ key: 'faller', title: 'Biggest faller', value: `▼${-faller.value}`, winners: faller.items.map((t) => ({ manager: t.manager, note: 'latest week' })) })

  const bench = extremes(totals, (t) => t.bench, Math.max)
  if (bench && bench.value > 0) list.push({ key: 'bench', title: 'Bench warmer', value: `${bench.value} pts`, winners: bench.items.map((t) => ({ manager: t.manager, note: 'left on the bench' })) })
  const hits = extremes(totals, (t) => t.hits, Math.max)
  if (hits && hits.value > 0) list.push({ key: 'hits', title: 'Hit machine', value: `−${hits.value} pts`, winners: hits.items.map((t) => ({ manager: t.manager, note: 'in transfer hits' })) })

  return list
}

// Season points each player has scored for the league's teams (counted points only: starters, with captain doubling).
export function playerOfTheLeague(squads, gameweeks, rows) {
  const names = new Map(rows.map((r) => [r.id, r.manager]))
  const byPlayer = new Map()
  for (const gw of gameweeks) {
    const data = squads[gw]
    if (!data) continue
    for (const [entryId, entry] of Object.entries(data.entries)) {
      const manager = names.get(Number(entryId)) ?? names.get(entryId)
      if (!manager || !entry.squad) continue
      for (const p of entry.squad.xi) {
        const counted = p.points * p.multiplier
        const item = byPlayer.get(p.id) ?? { id: p.id, name: p.name, type: p.type, points: 0, appearances: 0, owners: new Set(), best: { points: -Infinity, gw: null } }
        item.points += counted
        item.appearances += 1
        item.owners.add(manager)
        if (counted > item.best.points) item.best = { points: counted, gw }
        byPlayer.set(p.id, item)
      }
    }
  }
  return [...byPlayer.values()]
    .map((p) => ({ ...p, owners: [...p.owners] }))
    .sort((a, b) => b.points - a.points || b.appearances - a.appearances || a.name.localeCompare(b.name))
}
