import LiveDot from './LiveDot.jsx'
import { CHIP_COLORS } from './chips.js'

// Everyone's score for the latest gameweek (live while it's being played), highest first.
export default function LatestScores({ rows, gw, liveGw, colors, styleFor, squadData }) {
  if (gw == null) return null
  const scored = rows.filter((row) => row.gwPoints[gw] !== undefined).sort((a, b) => b.gwPoints[gw] - a.gwPoints[gw])
  if (scored.length === 0) return null

  return (
    <section className="latest" aria-label={`Gameweek ${gw} scores`}>
      <h2>
        Latest Scores <span className="latest-gw">GW{gw}</span>
        {gw === liveGw && <LiveDot />}
      </h2>
      <ul className="latest-grid">
        {scored.map((row) => {
          const chip = row.chipsByEvent[gw]
          const xi = squadData?.entries[row.id]?.squad?.xi
          // Players in the scoring XI who have got on the pitch so far.
          const played = xi ? xi.filter((player) => player.minutes > 0).length : null
          return (
            <li key={row.id} className="latest-card" style={{ '--mgr': colors.get(row.manager) }}>
              <span className="latest-name">{row.manager}</span>
              <span className="latest-team">{row.team}</span>
              <span className="latest-points" style={styleFor(row.gwPoints[gw])}>
                {row.gwPoints[gw]}
              </span>
              {played !== null && (
                <span className="latest-played" title={`${played} of ${xi.length} players have played`}>
                  {played}/{xi.length} played
                </span>
              )}
              {chip && (
                <span className="chip-badge" style={{ backgroundColor: CHIP_COLORS[chip] ?? '#64748b' }}>
                  {chip}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
