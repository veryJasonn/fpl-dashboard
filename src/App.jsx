import { useEffect, useMemo, useState } from 'react'
import VarianceChart from './VarianceChart.jsx'
import LiveDot from './LiveDot.jsx'
import TeamSheets from './TeamSheets.jsx'
import Awards from './Awards.jsx'
import Countdown from './Countdown.jsx'
import GwPicker from './GwPicker.jsx'
import { ManagerCell, RankMove } from './ManagerName.jsx'
import PlayerOfTheLeague from './PlayerOfTheLeague.jsx'
import SeasonStats from './SeasonStats.jsx'
import { CHIP_CODES, CHIP_COLORS } from './chips.js'
import { buildColorMap } from './managers.js'
import { mergeLive } from './mergeLive.js'
import { awards as buildAwards, rankMoves } from './stats.js'
import { useSquads } from './useSquads.js'
import summary from './summary.json'

const LEAGUE_ID = 1187651

const TABLE_TABS = [
  ['cumulative', 'Cumulative Scores'],
  ['chips', 'Chips Used'],
  ['transfers', 'Transfers Made'],
]

const LIVE_POLL_MS = 60_000
const IDLE_POLL_MS = 300_000
// ?forceEvent=5 previews live mode on a finished gameweek (ignored by the server in production).
const forcedEvent = new URLSearchParams(window.location.search).get('forceEvent')
const LIVE_URL = `/api/leagues-classic/${LEAGUE_ID}/live${forcedEvent ? `?forceEvent=${encodeURIComponent(forcedEvent)}` : ''}`

// Green (highest in column) fading to red (lowest in column).
function cellStyle(value, { min, max }) {
  if (value == null || max === min) return undefined
  const t = (value - min) / (max - min)
  const hue = t * 120 // 0 = red, 120 = green
  return { color: `hsl(${hue}, 85%, 55%)`, fontWeight: 700 }
}

function columnStats(values) {
  const nums = values.filter((v) => v != null)
  return { min: Math.min(...nums), max: Math.max(...nums) }
}

export default function App() {
  const [base, setBase] = useState(null)
  const [live, setLive] = useState(null)
  const [meta, setMeta] = useState(null)
  const [error, setError] = useState(null)
  const [recapGw, setRecapGw] = useState(null)
  const [tableTab, setTableTab] = useState('cumulative')

  useEffect(() => {
    fetch('/api/meta')
      .then((res) => (res.ok ? res.json() : null))
      .then(setMeta)
      .catch(() => {
        // Deadline and chip details are optional extras.
      })
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const standingsRes = await fetch(`/api/leagues-classic/${LEAGUE_ID}/standings`)
        if (!standingsRes.ok) throw new Error(`Standings request failed: ${standingsRes.status}`)
        const standingsData = await standingsRes.json()
        const entries = standingsData.standings?.results ?? []

        const histories = await Promise.all(
          entries.map((entry) =>
            fetch(`/api/entry/${entry.entry}/history`).then((res) => {
              if (!res.ok) throw new Error(`History request failed for entry ${entry.entry}: ${res.status}`)
              return res.json()
            }),
          ),
        )

        const gwSet = new Set()
        const builtRows = entries.map((entry, i) => {
          const history = histories[i]
          const gwPoints = {}
          const transfers = {}
          const hits = {}
          const bench = {}
          for (const gw of history.current ?? []) {
            // FPL's `points` is before transfer hits; its running totals are after them.
            gwPoints[gw.event] = gw.points - gw.event_transfers_cost
            transfers[gw.event] = gw.event_transfers
            hits[gw.event] = gw.event_transfers_cost
            bench[gw.event] = gw.points_on_bench
            gwSet.add(gw.event)
          }

          const chipsByEvent = {}
          const chipsUsed = {}
          for (const chip of history.chips ?? []) {
            const code = CHIP_CODES[chip.name] ?? chip.name.toUpperCase()
            chipsByEvent[chip.event] = code
            chipsUsed[code] = [...(chipsUsed[code] ?? []), chip.event]
          }

          return {
            id: entry.entry,
            rank: entry.rank,
            manager: entry.player_name,
            team: entry.entry_name,
            gwPoints,
            transfers,
            hits,
            bench,
            chipsByEvent,
            chipsUsed,
            total: entry.total,
          }
        })

        setBase({
          leagueName: standingsData.league?.name ?? '',
          gameweeks: [...gwSet],
          rows: builtRows,
        })
      } catch (err) {
        setError(err.message)
      }
    }

    load()
  }, [])

  const isLive = Boolean(live?.live)
  useEffect(() => {
    let cancelled = false
    async function loadLive() {
      try {
        const res = await fetch(LIVE_URL)
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setLive(data)
      } catch {
        // Live scores are optional; the page works without them.
      }
    }

    loadLive()
    const timer = setInterval(() => {
      if (!document.hidden) loadLive()
    }, isLive ? LIVE_POLL_MS : IDLE_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [isLive])

  const { rows, gameweeks, liveGw } = useMemo(
    () => (base ? mergeLive(base, live) : { rows: null, gameweeks: [], liveGw: null }),
    [base, live],
  )

  const gwStats = useMemo(() => {
    if (!rows) return {}
    const stats = {}
    for (const gw of gameweeks) {
      stats[gw] = columnStats(rows.map((r) => r.gwPoints[gw]))
    }
    return stats
  }, [rows, gameweeks])

  const totalStats = useMemo(() => {
    if (!rows) return { min: 0, max: 0 }
    return columnStats(rows.map((r) => r.total))
  }, [rows])

  const cumulativeRows = useMemo(() => {
    if (!rows) return null
    return rows.map((row) => {
      let running = 0
      const cumulative = {}
      for (const gw of gameweeks) {
        running += row.gwPoints[gw] ?? 0
        cumulative[gw] = running
      }
      return { ...row, cumulative }
    })
  }, [rows, gameweeks])

  const cumulativeGwStats = useMemo(() => {
    if (!cumulativeRows) return {}
    const stats = {}
    for (const gw of gameweeks) {
      stats[gw] = columnStats(cumulativeRows.map((r) => r.cumulative[gw]))
    }
    return stats
  }, [cumulativeRows, gameweeks])

  const colors = useMemo(() => buildColorMap(rows ?? []), [rows])
  const moves = useMemo(() => (rows ? rankMoves(rows, gameweeks) : new Map()), [rows, gameweeks])
  const awardList = useMemo(() => (rows ? buildAwards(rows, gameweeks, moves) : []), [rows, gameweeks, moves])
  const { squads, failed, allLoaded } = useSquads({ leagueId: LEAGUE_ID, gameweeks, live })
  const latestGw = gameweeks.at(-1)

  const recaps = summary.recaps
  const recap = recaps.find((r) => r.gameweek === recapGw) ?? recaps[recaps.length - 1]

  const title = `${base?.leagueName || 'FPL Mini-League'} Fantasy Premier League`

  return (
    <>
      <h1 className="marquee" aria-label={title}>
        <span className="marquee-track" aria-hidden="true">
          {[0, 1].map((group) => (
            <span key={group} className="marquee-group">
              {[0, 1, 2].map((copy) => (
                <span key={copy} className="marquee-item">{title}</span>
              ))}
            </span>
          ))}
        </span>
      </h1>
      {meta && <Countdown events={meta.events} />}
      <h2>Gameweek {recap.gameweek} Recap</h2>
      {recaps.length > 1 && (
        <GwPicker
          gameweeks={recaps.map((r) => r.gameweek)}
          active={recap.gameweek}
          label="Choose a recap"
          onSelect={setRecapGw}
        />
      )}
      {recap.paragraphs.map((text) => (
        <p key={text} className="recap">
          {text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part))}
        </p>
      ))}
      {error && <p className="status error">Failed to load data: {error}</p>}
      {!error && !rows && <p className="status">Loading gameweek scores…</p>}
      {rows && (
        <>
          <h2>Gameweek Scores</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Manager</th>
                  {gameweeks.map((gw) => (
                    <th key={gw} className="num">
                      GW{gw}
                      {gw === liveGw && <LiveDot />}
                    </th>
                  ))}
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.rank}<RankMove move={moves.get(row.id)} /></td>
                    <td><ManagerCell name={row.manager} team={row.team} color={colors.get(row.manager)} /></td>
                    {gameweeks.map((gw) => (
                      <td key={gw} className="num" style={cellStyle(row.gwPoints[gw], gwStats[gw])}>
                        {row.gwPoints[gw] ?? '-'}
                      </td>
                    ))}
                    <td className="num" style={cellStyle(row.total, totalStats)}>{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {rows && (
        <div className="gw-picker table-tabs" role="group" aria-label="Choose a table">
          {TABLE_TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`gw-pill${key === tableTab ? ' gw-pill-active' : ''}`}
              aria-pressed={key === tableTab}
              onClick={() => setTableTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {cumulativeRows && tableTab === 'cumulative' && (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Manager</th>
                  {gameweeks.map((gw) => (
                    <th key={gw} className="num">
                      GW{gw}
                      {gw === liveGw && <LiveDot />}
                    </th>
                  ))}
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {cumulativeRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.rank}<RankMove move={moves.get(row.id)} /></td>
                    <td><ManagerCell name={row.manager} team={row.team} color={colors.get(row.manager)} /></td>
                    {gameweeks.map((gw) => (
                      <td key={gw} className="num" style={cellStyle(row.cumulative[gw], cumulativeGwStats[gw])}>
                        {row.cumulative[gw] ?? '-'}
                      </td>
                    ))}
                    <td className="num" style={cellStyle(row.total, totalStats)}>{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {rows && tableTab === 'chips' && (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Manager</th>
                  {gameweeks.map((gw) => (
                    <th key={gw} className="num">
                      GW{gw}
                      {gw === liveGw && <LiveDot />}
                    </th>
                  ))}
                  <th className="num"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.rank}<RankMove move={moves.get(row.id)} /></td>
                    <td><ManagerCell name={row.manager} team={row.team} color={colors.get(row.manager)} /></td>
                    {gameweeks.map((gw) => {
                      const chip = row.chipsByEvent[gw]
                      return (
                        <td key={gw} className="num">
                          {chip ? (
                            <span className="chip-badge" style={{ backgroundColor: CHIP_COLORS[chip] ?? '#64748b' }}>
                              {chip}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                      )
                    })}
                    <td className="num"></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {rows && tableTab === 'transfers' && (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Manager</th>
                  {gameweeks.map((gw) => (
                    <th key={gw} className="num">
                      GW{gw}
                      {gw === liveGw && <LiveDot />}
                    </th>
                  ))}
                  <th className="num"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.rank}<RankMove move={moves.get(row.id)} /></td>
                    <td><ManagerCell name={row.manager} team={row.team} color={colors.get(row.manager)} /></td>
                    {gameweeks.map((gw) => (
                      <td key={gw} className="num">{row.transfers[gw] ?? '-'}</td>
                    ))}
                    <td className="num"></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="table-note">* Transfers are shown as 0 in any gameweek where the WC chip is used.</p>
        </>
      )}

      {cumulativeRows && <VarianceChart rows={cumulativeRows} gameweeks={gameweeks} liveGw={liveGw} />}

      {rows && meta && latestGw && (
        <SeasonStats rows={rows} gameweeks={gameweeks} chips={meta.chips} event={latestGw} colors={colors} />
      )}

      {rows && live && (
        <TeamSheets
          rows={rows}
          gameweeks={gameweeks}
          squads={squads}
          failed={failed}
          live={live}
          liveGw={liveGw}
          colors={colors}
          betweenCardsAndOwnership={<Awards awards={awardList} colors={colors} />}
        />
      )}

      {rows && live && (
        <PlayerOfTheLeague squads={squads} gameweeks={gameweeks} rows={rows} colors={colors} allLoaded={allLoaded} />
      )}
    </>
  )
}
