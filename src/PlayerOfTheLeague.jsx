import { useMemo } from 'react'
import { playerOfTheLeague } from './stats.js'

const POSITION_LABEL = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' }
const TOP_N = 10

export default function PlayerOfTheLeague({ squads, gameweeks, rows, colors, allLoaded }) {
  const players = useMemo(() => playerOfTheLeague(squads, gameweeks, rows), [squads, gameweeks, rows])
  const loadedCount = gameweeks.filter((gw) => squads[gw]).length
  if (players.length === 0) return null
  const [champion, ...rest] = players.slice(0, TOP_N)

  return (
    <>
      <h2>Player of the League</h2>
      <section className="potl-hero">
        <span className="potl-crown" aria-hidden="true">1</span>
        <div>
          <p className="potl-name">{champion.name}</p>
          <p className="potl-sub">
            {POSITION_LABEL[champion.type]} · {champion.points} points for this league's teams · best week {champion.best.points} (GW{champion.best.gw})
          </p>
        </div>
        <span className="owner-dots">
          {champion.owners.map((m) => (
            <span key={m} className="owner-dot" style={{ '--dot': colors.get(m) }} title={m} />
          ))}
        </span>
      </section>

      <div className="table-scroll">
        <table className="ownership">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Player</th>
              <th>Counted by</th>
              <th className="num">Starts</th>
              <th className="num">Best week</th>
              <th className="num">Points</th>
            </tr>
          </thead>
          <tbody>
            {[champion, ...rest].map((p, i) => (
              <tr key={p.id}>
                <td className="num">{i + 1}</td>
                <td>
                  <span className="player-pos">{POSITION_LABEL[p.type]}</span> {p.name}
                </td>
                <td>
                  <span className="owner-dots">
                    {p.owners.map((m) => (
                      <span key={m} className="owner-dot" style={{ '--dot': colors.get(m) }} title={m} />
                    ))}
                  </span>
                </td>
                <td className="num">{p.appearances}</td>
                <td className="num">{p.best.points} <span className="player-pos">GW{p.best.gw}</span></td>
                <td className="num"><strong>{p.points}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="table-note">
        Points a player has scored while in a manager&apos;s starting XI (captain doubling included), added up across the whole league.
        {!allLoaded && ` Loading… ${loadedCount} of ${gameweeks.length} gameweeks so far.`}
      </p>
    </>
  )
}
