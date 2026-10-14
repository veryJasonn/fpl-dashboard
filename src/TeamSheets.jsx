import { useMemo, useState } from 'react'
import GwPicker from './GwPicker.jsx'
import LiveDot from './LiveDot.jsx'
import { CHIP_CODES, CHIP_COLORS } from './chips.js'
import { byManagerName } from './managers.js'

const POSITION_LABEL = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' }
const OWNERSHIP_PREVIEW = 15

function pointsClass(points) {
  if (points >= 9) return 'pts-hi'
  if (points < 0) return 'pts-neg'
  if (points === 0) return 'pts-zero'
  return ''
}

function PlayerRow({ player }) {
  const counted = player.points * player.multiplier
  const onBench = player.multiplier === 0
  return (
    <li className={`player${onBench ? ' player-bench' : ''}`}>
      <span className="player-pos">{POSITION_LABEL[player.type]}</span>
      <span className="player-name">
        {player.name}
        {player.captain && <span className="player-badge" title="Captain (armband)">C</span>}
        {player.vice && <span className="player-badge player-badge-vice" title="Vice-captain">V</span>}
        {player.subbedIn && <span className="player-sub player-sub-in" title="Subbed in">↑</span>}
        {player.subbedOut && <span className="player-sub player-sub-out" title="Subbed out">↓</span>}
      </span>
      <span className={`player-pts ${pointsClass(player.points)}`}>
        {player.multiplier > 1 && <span className="player-mult" title={`${player.points} x ${player.multiplier}`}>×{player.multiplier}</span>}
        {onBench ? player.points : counted}
      </span>
    </li>
  )
}

// Who has which players this gameweek: shared picks first, then differentials.
function Ownership({ data, rows, colors, gw }) {
  const [showAll, setShowAll] = useState(false)

  const players = useMemo(() => {
    const byId = new Map()
    for (const row of rows) {
      const squad = data.entries[row.id]?.squad
      if (!squad) continue
      for (const [group, list] of [['xi', squad.xi], ['bench', squad.bench]]) {
        for (const p of list) {
          const entry = byId.get(p.id) ?? { id: p.id, name: p.name, type: p.type, points: p.points, owners: [] }
          entry.owners.push({ manager: row.manager, inXi: group === 'xi', captain: p.captain })
          byId.set(p.id, entry)
        }
      }
    }
    return [...byId.values()].sort((a, b) => b.owners.length - a.owners.length || b.points - a.points || a.name.localeCompare(b.name))
  }, [data, rows])

  if (players.length === 0) return null
  const shown = showAll ? players : players.slice(0, OWNERSHIP_PREVIEW)

  return (
    <>
      <h2>Gameweek {gw} Ownership</h2>
      <div className="table-scroll">
        <table className="ownership">
          <thead>
            <tr>
              <th>Player</th>
              <th>Owned by</th>
              <th className="num">Owners</th>
              <th className="num">Pts</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id}>
                <td>
                  <span className="player-pos">{POSITION_LABEL[p.type]}</span> {p.name}
                  {p.owners.length === 1 && <span className="tag-diff">differential</span>}
                </td>
                <td>
                  <span className="owner-dots">
                    {[...p.owners].sort(byManagerName).map((o) => (
                      <span
                        key={o.manager}
                        className={`owner-dot${o.inXi ? '' : ' owner-dot-bench'}`}
                        style={{ '--dot': colors.get(o.manager) }}
                        title={`${o.manager}${o.inXi ? '' : ' (bench)'}${o.captain ? ' (captain)' : ''}`}
                      />
                    ))}
                  </span>
                </td>
                <td className="num">{p.owners.length}</td>
                <td className={`num ${pointsClass(p.points)}`}>{p.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ownership-foot">
        <p className="table-note">Filled dot = in the scoring XI, hollow = on the bench. {players.length} different players across the league.</p>
        {players.length > OWNERSHIP_PREVIEW && (
          <button type="button" className="gw-pill" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show fewer' : `Show all ${players.length}`}
          </button>
        )}
      </div>
    </>
  )
}

export default function TeamSheets({ rows, gameweeks, squads, failed, live, liveGw, colors, betweenCardsAndOwnership }) {
  const currentEvent = live?.event ?? null
  const [selected, setSelected] = useState(null)

  if (currentEvent == null) return null

  const gw = selected ?? currentEvent
  const isCurrent = gw === currentEvent
  const data = squads[gw]

  // The league table at that point in the season, not today's, for past gameweeks.
  const totalAt = (row) =>
    Object.entries(row.gwPoints)
      .filter(([event]) => Number(event) <= gw)
      .reduce((sum, [, points]) => sum + points, 0)
  const totals = new Map(rows.map((row) => [row.id, totalAt(row)]))
  const rankOf = (row) => (isCurrent ? row.rank : 1 + rows.filter((o) => totals.get(o.id) > totals.get(row.id)).length)

  const cards = data
    ? rows
        .filter((row) => data.entries[row.id]?.squad)
        .sort(byManagerName)
        .map((row) => ({ row, rank: rankOf(row) }))
    : []

  return (
    <>
      <h2>
        Gameweek {gw} Teams
        {gw === liveGw && <LiveDot />}
      </h2>
      <GwPicker
        gameweeks={gameweeks}
        active={gw}
        liveGw={liveGw}
        label="Choose a gameweek"
        onSelect={(g) => setSelected(g === currentEvent ? null : g)}
      />

      {!data && !failed[gw] && <p className="status">Loading gameweek {gw} teams…</p>}
      {!data && failed[gw] && <p className="status error">Couldn&apos;t load gameweek {gw}. Pick another gameweek, then come back to retry.</p>}

      {data && (
        <>
          <div className="team-grid">
            {cards.map(({ row, rank }) => {
              const entry = data.entries[row.id]
              const chip = entry.chip ? CHIP_CODES[entry.chip] ?? entry.chip.toUpperCase() : null
              return (
                <section key={row.id} className="team-card" style={{ borderTopColor: colors.get(row.manager) }}>
                  <header className="team-head">
                    <span className="team-rank" title={isCurrent ? 'League position' : `League position after GW${gw}`}>{rank}</span>
                    <span className="team-names">
                      <strong>{row.manager}</strong>
                      <span>{row.team}</span>
                    </span>
                    <span className="team-score">
                      {entry.points}
                      <small>pts</small>
                    </span>
                  </header>
                  <ul className="player-list">
                    {entry.squad.xi.map((player, i) => (
                      <PlayerRow key={`xi-${i}`} player={player} />
                    ))}
                  </ul>
                  {entry.squad.bench.length > 0 && (
                    <>
                      <p className="bench-label">Bench</p>
                      <ul className="player-list">
                        {entry.squad.bench.map((player, i) => (
                          <PlayerRow key={`bench-${i}`} player={player} />
                        ))}
                      </ul>
                    </>
                  )}
                  {(chip || entry.hit > 0) && (
                    <p className="team-foot">
                      {chip && (
                        <span className="chip-badge" style={{ backgroundColor: CHIP_COLORS[chip] ?? '#64748b' }}>{chip}</span>
                      )}
                      {entry.hit > 0 && <span className="team-hit">−{entry.hit} transfer hit</span>}
                    </p>
                  )}
                </section>
              )
            })}
          </div>
          <p className="table-note">
            C captain · V vice-captain · ↑ subbed in · ↓ subbed out · bench points aren&apos;t counted · ×2 means points doubled
          </p>
          {betweenCardsAndOwnership}
          <Ownership data={data} rows={rows} colors={colors} gw={gw} />
        </>
      )}
    </>
  )
}
