import { useEffect, useMemo, useRef, useState } from 'react'
import LiveDot from './LiveDot.jsx'
import { buildColorMap, byManagerName } from './managers.js'

const SURFACE = '#0f172a'
const DEFAULT_WIDTH = 760
const HEIGHT = 300
const PAD = { top: 24, right: 24, bottom: 36, left: 52 }
const PLOT_H = HEIGHT - PAD.top - PAD.bottom

// Gridlines are always 10 points apart.
function pickStep() {
  return 10
}

const AXIS_LABEL_Y = HEIGHT - PAD.bottom + 20
const AXIS_CHAR_W = 6.6

export default function VarianceChart({ rows, gameweeks, liveGw }) {
  const svgRef = useRef(null)
  const wrapRef = useRef(null)
  const [hoverIdx, setHoverIdx] = useState(null)
  const [width, setWidth] = useState(DEFAULT_WIDTH)

  // Draw at the container's real width so text and dots keep their size on phones instead of shrinking.
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return undefined
    const update = () => setWidth(Math.max(300, Math.min(DEFAULT_WIDTH, Math.round(wrap.clientWidth))))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [])

  const WIDTH = width
  const narrow = width < 520
  const pad = narrow ? { ...PAD, left: 40, right: 22 } : PAD
  const PLOT_W = WIDTH - pad.left - pad.right

  const { series, yMin, yMax, yTicks } = useMemo(() => {
    if (!rows.length || !gameweeks.length) return { series: [], yMin: -10, yMax: 10, yTicks: [0] }

    const avgByGw = gameweeks.map((gw) => {
      const sum = rows.reduce((s, r) => s + (r.cumulative[gw] ?? 0), 0)
      return sum / rows.length
    })

    // Alphabetical, not rank order, so each team's position stays fixed
    // regardless of how the standings shuffle week to week.
    const sortedRows = [...rows].sort(byManagerName)

    const colors = buildColorMap(rows)
    const series = sortedRows.map((row) => ({
      id: row.id,
      manager: row.manager,
      color: colors.get(row.manager),
      values: gameweeks.map((gw, gi) => (row.cumulative[gw] ?? 0) - avgByGw[gi]),
    }))

    const maxAbs = Math.max(1, ...series.flatMap((s) => s.values.map((v) => Math.abs(v))))
    const step = pickStep(maxAbs)
    const bound = Math.ceil(maxAbs / step) * step
    const yTicks = []
    for (let v = -bound; v <= bound + 1e-9; v += step) yTicks.push(Math.round(v))

    return { series, yMin: -bound, yMax: bound, yTicks }
  }, [rows, gameweeks])

  const xForIndex = (i) => (gameweeks.length > 1 ? pad.left + (i / (gameweeks.length - 1)) * PLOT_W : pad.left + PLOT_W / 2)
  const yForValue = (v) => pad.top + PLOT_H - ((v - yMin) / (yMax - yMin)) * PLOT_H

  function handleMove(e) {
    const svg = svgRef.current
    if (!svg || gameweeks.length === 0) return
    const ctm = svg.getScreenCTM()
    if (!ctm) return
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const loc = pt.matrixTransform(ctm.inverse())
    const ratio = gameweeks.length > 1 ? (loc.x - pad.left) / PLOT_W : 0
    const idx = Math.round(ratio * (gameweeks.length - 1))
    setHoverIdx(Math.min(gameweeks.length - 1, Math.max(0, idx)))
  }

  if (!series.length) return null

  const labelEvery = PLOT_W / Math.max(1, gameweeks.length - 1) < 36 ? 2 : 1
  const hoverX = hoverIdx != null ? xForIndex(hoverIdx) : null
  const tooltipRows = hoverIdx != null ? [...series].sort((a, b) => b.values[hoverIdx] - a.values[hoverIdx]) : []
  const hoverPct = hoverX != null ? (hoverX / WIDTH) * 100 : 0
  const anchorLeft = hoverPct < 55

  return (
    <>
      <h2>Cumulative Score vs League Average</h2>
      <div className="chart-scroll">
      <div className="chart-wrap" ref={wrapRef}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="variance-chart"
          onPointerMove={handleMove}
          onPointerDown={handleMove}
          onPointerLeave={() => setHoverIdx(null)}
        >
          {yTicks.map((t) => (
            <g key={t}>
              <line
                x1={pad.left}
                x2={WIDTH - pad.right}
                y1={yForValue(t)}
                y2={yForValue(t)}
                className={t === 0 ? 'chart-zero-line' : 'chart-gridline'}
              />
              <text x={pad.left - 8} y={yForValue(t)} className="chart-axis-label" textAnchor="end" dominantBaseline="middle">
                {t > 0 ? `+${t}` : t}
              </text>
            </g>
          ))}

          {gameweeks.map((gw, i) => (
            <g key={gw}>
              {(i % labelEvery === 0 || i === gameweeks.length - 1) && <text x={xForIndex(i)} y={AXIS_LABEL_Y} className="chart-axis-label" textAnchor="middle">
                GW{gw}
              </text>}
              {gw === liveGw && (
                <circle
                  className="live-dot-svg"
                  cx={xForIndex(i) + (`GW${gw}`.length * AXIS_CHAR_W) / 2 + 6}
                  cy={AXIS_LABEL_Y - 4}
                  r="3"
                />
              )}
            </g>
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

          {hoverX != null && <line x1={hoverX} x2={hoverX} y1={pad.top} y2={HEIGHT - PAD.bottom} className="chart-crosshair" />}
        </svg>

        {hoverIdx != null && (
          <div className="chart-tooltip" style={anchorLeft ? { left: `${hoverPct}%` } : { right: `${100 - hoverPct}%` }}>
            <div className="chart-tooltip-header">
              GW{gameweeks[hoverIdx]}
              {gameweeks[hoverIdx] === liveGw && <LiveDot />}
            </div>
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
