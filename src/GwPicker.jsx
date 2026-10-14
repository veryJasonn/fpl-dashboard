import { useEffect, useRef } from 'react'
import LiveDot from './LiveDot.jsx'

// Row of gameweek buttons. On phones it is a single sideways-scrolling row that keeps the selected button centered.
export default function GwPicker({ gameweeks, active, liveGw, onSelect, label }) {
  const rowRef = useRef(null)

  useEffect(() => {
    const row = rowRef.current
    const pill = row?.querySelector('.gw-pill-active')
    if (!row || !pill) return
    row.scrollLeft = pill.offsetLeft - (row.clientWidth - pill.offsetWidth) / 2
  }, [active, gameweeks.length])

  return (
    <div ref={rowRef} className="gw-picker" role="group" aria-label={label}>
      {gameweeks.map((gw) => (
        <button
          key={gw}
          type="button"
          className={`gw-pill${gw === active ? ' gw-pill-active' : ''}`}
          aria-pressed={gw === active}
          onClick={() => onSelect(gw)}
        >
          GW{gw}
          {gw === liveGw && <LiveDot />}
        </button>
      ))}
    </div>
  )
}
