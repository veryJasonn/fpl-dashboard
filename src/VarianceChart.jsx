import { useMemo, useRef, useState } from 'react'

// Keyed by manager so each person keeps their color and chart position
// regardless of how the league standings reorder week to week.
const MANAGER_COLORS = {
  'Ben Wedd': '#3987e5',
  'Ryan Croft': '#d95926',
  'Jason Shao': '#199e70',
  'Benji Klotz': '#c98500',
  'vikram ahuja': '#a855f7',
  'Ajay Mariswamy': '#E056FD',
}
const FALLBACK_COLORS = ['#d55181', '#008300', '#9085e9', '#e66767']

const SURFACE = '#0f172a'
const WIDTH = 760
const HEIGHT = 360
const PAD = { top: 24, right: 24, bottom: 36, left: 52 }
const PLOT_W = WIDTH - PAD.left - PAD.right
const PLOT_H = HEIGHT - PAD.top - PAD.bottom

function niceStep(maxAbs) {
  const rough = maxAbs / 4 || 1
  const mag = 10 ** Math.floor(Math.log10(rough))
  const norm = rough / mag
  if (norm < 1.5) return 1 * mag
  if (norm < 3.5) return 2 * mag
  if (norm < 7.5) return 5 * mag
  return 10 * mag
}

export default function VarianceChart({ rows, gameweeks }) {
  const svgRef = useRef(null)
  const [hoverIdx, setHoverIdx] = useState(null)

  const { series, yMin, yMax, yTicks } = useMemo(() => {
    if (!rows.length || !gameweeks.length) return { series: [], yMin: -10, yMax: 10, yTicks: [0] }

    const avgByGw = gameweeks.map((gw) => {
      const sum = rows.reduce((s, r) => s + (r.cumulative[gw] ?? 0), 0)
      return sum / rows.length
    })

    // Alphabetical, not rank order, so each team's position stays fixed
    // regardless of how the standings shuffle week to week.
    const sortedRows = [...rows].sort((a, b) => a.manager.localeCompare(b.manager, undefined, { sensitivity: 'base' }))

    let fallbackIdx = 0
    const series = sortedRows.map((row) => ({
      id: row.id,
      manager: row.manager,
      color: MANAGER_COLORS[row.manager] ?? FALLBACK_COLORS[fallbackIdx++ % FALLBACK_COLORS.length],
      values: gameweeks.map((gw, gi) => (row.cumulative[gw] ?? 0) - avgByGw[gi]),
    }))

    const maxAbs = Math.max(1, ...series.flatMap((s) => s.values.map((v) => Math.abs(v))))
    const step = niceStep(maxAbs)
    const bound = Math.ceil(maxAbs / step) * step
    const yTicks = []
    for (let v = -bound; v <= bound + 1e-9; v += step) yTicks.push(Math.round(v))

    return { series, yMin: -bound, yMax: bound, yTicks }
  }, [rows, gameweeks])

  const xForIndex = (i) => (gameweeks.length > 1 ? PAD.left + (i / (gameweeks.length - 1)) * PLOT_W : PAD.left + PLOT_W / 2)
  const yForValue = (v) => PAD.top + PLOT_H - ((v - yMin) / (yMax - yMin)) * PLOT_H

  function handleMove(e) {
    const svg = svgRef.current
    if (!svg || gameweeks.length === 0) return
    const ctm = svg.getScreenCTM()
    if (!ctm) return
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const loc = pt.matrixTransform(ctm.inverse())
    const ratio = gameweeks.length > 1 ? (loc.x - PAD.left) / PLOT_W : 0
    const idx = Math.round(ratio * (gameweeks.length - 1))
    setHoverIdx(Math.min(gameweeks.length - 1, Math.max(0, idx)))
  }

  if (!series.length) return null

  const hoverX = hoverIdx != null ? xForIndex(hoverIdx) : null
  const tooltipRows = hoverIdx != null ? [...series].sort((a, b) => b.values[hoverIdx] - a.values[hoverIdx]) : []
  const hoverPct = hoverX != null ? (hoverX / WIDTH) * 100 : 0
  const anchorLeft = hoverPct < 55

  return (
    <>
      <h2>Cumulative Score vs League Average</h2>
      <div className="chart-wrap">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="variance-chart"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {yTicks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={yForValue(t)}
                y2={yForValue(t)}
                className={t === 0 ? 'chart-zero-line' : 'chart-gridline'}
              />
              <text x={PAD.left - 8} y={yForValue(t)} className="chart-axis-label" textAnchor="end" dominantBaseline="middle">
                {t > 0 ? `+${t}` : t}
              </text>
            </g>
          ))}

          {gameweeks.map((gw, i) => (
            <text key={gw} x={xForIndex(i)} y={HEIGHT - PAD.bottom + 20} className="chart-axis-label" textAnchor="middle">
              GW{gw}
            </text>
          ))}

          {series.map((s) => (
            <polyline
              key={s.id}
              points={s.values.map((v, i) => `${xForIndex(i)},${yForValue(v)}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {series.map((s) =>
            s.values.map((v, i) => (
              <circle key={`${s.id}-${i}`} cx={xForIndex(i)} cy={yForValue(v)} r="5" fill={s.color} stroke={SURFACE} strokeWidth="2" />
            )),
          )}

          {hoverX != null && <line x1={hoverX} x2={hoverX} y1={PAD.top} y2={HEIGHT - PAD.bottom} className="chart-crosshair" />}
        </svg>

        {hoverIdx != null && (
          <div className="chart-tooltip" style={anchorLeft ? { left: `${hoverPct}%` } : { right: `${100 - hoverPct}%` }}>
            <div className="chart-tooltip-header">GW{gameweeks[hoverIdx]}</div>
            {tooltipRows.map((s) => (
              <div key={s.id} className="chart-tooltip-row">
                <span className="chart-tooltip-key" style={{ backgroundColor: s.color }} />
                <span className="chart-tooltip-name">{s.manager}</span>
                <span className="chart-tooltip-value">
                  {s.values[hoverIdx] > 0 ? '+' : ''}
                  {Math.round(s.values[hoverIdx])}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <ul className="chart-legend">
        {series.map((s) => (
          <li key={s.id}>
            <span className="legend-swatch" style={{ backgroundColor: s.color }} />
            {s.manager}
          </li>
        ))}
      </ul>
    </>
  )
}
