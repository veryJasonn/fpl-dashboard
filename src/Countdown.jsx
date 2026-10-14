import { useEffect, useState } from 'react'

function format(ms) {
  const minutes = Math.floor(ms / 60_000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  if (days > 0) return `${days}d ${hours}h ${mins}m`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${Math.max(mins, 0)}m`
}

export default function Countdown({ events }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const next = events?.find((e) => new Date(e.deadline).getTime() > now)
  if (!next) return null
  const deadline = new Date(next.deadline)

  return (
    <p className="countdown" title={deadline.toLocaleString()}>
      <span className="countdown-label">GW{next.id} deadline in</span>
      <strong>{format(deadline.getTime() - now)}</strong>
      <span className="countdown-date">{deadline.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
    </p>
  )
}
