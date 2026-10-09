export const CHIP_CODES = { wildcard: 'WC', freehit: 'FH', '3xc': 'TC', bboost: 'BB' }

// Overlays live gameweek points onto the rows built from FPL's official history.
// While the gameweek is live our computed points win; once it ends, the official
// history takes over as soon as it contains that gameweek.
export function mergeLive(base, live) {
  const liveEvent = live?.event ?? null
  const gwSet = new Set(base.gameweeks)
  if (liveEvent != null) gwSet.add(liveEvent)

  let overridden = false
  const merged = base.rows.map((row) => {
    const entry = liveEvent != null ? live.entries[row.id] : undefined
    if (!entry || (!live.live && row.gwPoints[liveEvent] !== undefined)) return row
    overridden = true
    const gwPoints = { ...row.gwPoints, [liveEvent]: entry.points }
    const chipsByEvent = { ...row.chipsByEvent }
    if (entry.chip && chipsByEvent[liveEvent] === undefined) {
      chipsByEvent[liveEvent] = CHIP_CODES[entry.chip] ?? entry.chip.toUpperCase()
    }
    const total = Object.values(gwPoints).reduce((sum, p) => sum + p, 0)
    return { ...row, gwPoints, chipsByEvent, total }
  })

  let rows = merged
  if (overridden) {
    const byTotal = [...merged].sort((a, b) => b.total - a.total)
    rows = byTotal.map((row) => ({ ...row, rank: 1 + byTotal.filter((o) => o.total > row.total).length }))
  }

  return {
    rows,
    gameweeks: [...gwSet].sort((a, b) => a - b),
    liveGw: live?.live ? live.event : null,
  }
}
