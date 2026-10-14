// Alphabetical by manager name: the fixed order used by the chart and the team cards.
export const byManagerName = (a, b) => a.manager.localeCompare(b.manager, undefined, { sensitivity: 'base' })

// Keyed by manager so each person keeps their color regardless of how standings reorder.
const MANAGER_COLORS = {
  'Ben Wedd': '#DC2626',
  'Ryan Croft': '#F97316',
  'Jason Shao': '#FACC15',
  'Benji Klotz': '#3B82F6',
  'vikram ahuja': '#9333EA',
  'Ajay Mariswamy': '#0DC9B0',
}
const FALLBACK_COLORS = ['#d55181', '#008300', '#9085e9', '#e66767']

// Map of manager name -> color; anyone not listed above gets the next fallback in alphabetical order.
export function buildColorMap(rows) {
  const colors = new Map()
  let fallback = 0
  for (const row of [...rows].sort(byManagerName)) {
    colors.set(row.manager, MANAGER_COLORS[row.manager] ?? FALLBACK_COLORS[fallback++ % FALLBACK_COLORS.length])
  }
  return colors
}
