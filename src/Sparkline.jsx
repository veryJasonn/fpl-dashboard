const W = 96
const H = 26
const PAD = 3

export default function Sparkline({ values, color, label }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const x = (i) => PAD + (i / (values.length - 1)) * (W - PAD * 2)
  const y = (v) => H - PAD - ((v - min) / span) * (H - PAD * 2)
  const last = values.length - 1
  return (
    <svg className="sparkline" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <polyline points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(values[last])} r="2.6" fill={color} />
    </svg>
  )
}
