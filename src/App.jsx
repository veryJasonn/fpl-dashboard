import { useEffect, useMemo, useState } from 'react'
import VarianceChart from './VarianceChart.jsx'
import LiveDot from './LiveDot.jsx'
import LatestScores from './LatestScores.jsx'
import TeamSheets from './TeamSheets.jsx'
import Awards from './Awards.jsx'
import Countdown from './Countdown.jsx'
import { fetchJson } from './fetchJson.js'
import GwPicker from './GwPicker.jsx'
import { ManagerCell, RankMove } from './ManagerName.jsx'
import SeasonStats from './SeasonStats.jsx'
import { CHIP_CODES, CHIP_COLORS } from './chips.js'
import { buildColorMap } from './managers.js'
import { mergeLive } from './mergeLive.js'
import { awards as buildAwards, rankMoves } from './stats.js'
import { useSquads } from './useSquads.js'
import summary from './summary.json'

const LEAGUE_ID = 1187651

const TABLE_TABS = [
  ['gameweek', 'Gameweek Scores'],
  ['cumulative', 'Cumulative Scores'],
  ['chips', 'Chips Used'],
  ['transfers', 'Transfers Made'],
]

// The last good responses are kept in localStorage so the page still shows data when FPL is being updated.
const OVERVIEW_KEY = `fpl-overview:v1:${LEAGUE_ID}`
const LIVE_KEY = `fpl-live:v1:${LEAGUE_ID}`
const PAGE_SIZE = 8
const PAGE_SIZE_NARROW = 3
const SAVED_RETRY_DELAYS_MS = [30_000, 60_000, 120_000, 300_000]

function readLocal(key) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveLocal(key, data) {
  try {
    window.localStorage.setItem(key, JSON.stringify(data))
  } catch {
    // Storage full or unavailable: the page just won't have a fallback copy.
  }
}

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

function useNarrowScreen() {
  const query = '(max-width: 700px)'
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setNarrow(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return narrow
}

export default function App() {
  const [base, setBase] = useState(null)
  const [live, setLive] = useState(null)
  const [meta, setMeta] = useState(null)
  const [error, setError] = useState(null)
  const [savedCopy, setSavedCopy] = useState(false)
  const [recapGw, setRecapGw] = useState(null)
  const [recapOpen, setRecapOpen] = useState(false)
  const [tableTab, setTableTab] = useState('gameweek')

  useEffect(() => {
    let cancelled = false
    let retryTimer
    let failures = 0

    async function load() {
      try {
        let data
        try {
          data = await fetchJson(`/api/leagues-classic/${LEAGUE_ID}/overview`)
          saveLocal(OVERVIEW_KEY, data)
          if (!cancelled) setSavedCopy(false)
        } catch (err) {
          // FPL is down or being updated: show the last copy we saved and keep trying in the background.
          data = readLocal(OVERVIEW_KEY)
          if (!data) throw err
          if (!cancelled) setSavedCopy(true)
          // Back off (30s, 1m, 2m, then every 5m) so an FPL outage isn't hammered by every open tab.
          retryTimer = setTimeout(load, SAVED_RETRY_DELAYS_MS[Math.min(failures, SAVED_RETRY_DELAYS_MS.length - 1)])
          failures += 1
        }
        if (cancelled) return
        setError(null)

        const gwSet = new Set()
        const builtRows = data.entries.map((entry) => {
          const gwPoints = {}
          const transfers = {}
          const hits = {}
          const bench = {}
          for (const gw of entry.gameweeks) {
            // FPL's `points` is before transfer hits; its running totals are after them.
            gwPoints[gw.event] = gw.points - gw.cost
            transfers[gw.event] = gw.transfers
            hits[gw.event] = gw.cost
            bench[gw.event] = gw.bench
            gwSet.add(gw.event)
          }

          const chipsByEvent = {}
          for (const chip of entry.chips) {
            chipsByEvent[chip.event] = CHIP_CODES[chip.name] ?? chip.name.toUpperCase()
          }

          return {
            id: entry.id,
            rank: entry.rank,
            manager: entry.manager,
            team: entry.team,
            gwPoints,
            transfers,
            hits,
            bench,
            chipsByEvent,
            total: entry.total,
          }
        })

        setBase({ leagueName: data.leagueName, gameweeks: [...gwSet], rows: builtRows })
        setMeta({ events: data.events, chips: data.chips })
      } catch (err) {
        setError(err.message)
      }
    }

    load()
    return () => {
      cancelled = true
      clearTimeout(retryTimer)
    }
  }, [])

  const isLive = Boolean(live?.live)
  useEffect(() => {
    let cancelled = false
    async function loadLive() {
      try {
        const data = await fetchJson(LIVE_URL)
        saveLocal(LIVE_KEY, data)
        if (!cancelled) setLive(data)
      } catch {
        // Live scores are optional; on a failed first load fall back to the last copy we saved.
        const saved = readLocal(LIVE_KEY)
        if (saved && !cancelled) setLive((current) => current ?? saved)
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

  // The score tables show one page of gameweeks (the latest by default) with arrows to page back and
  // forward, so they never scroll sideways. Phones have room for fewer columns.
  const narrow = useNarrowScreen()
  const pageSize = narrow ? PAGE_SIZE_NARROW : PAGE_SIZE
  const [pageOffset, setPageOffset] = useState(0)
  const pageEnd = Math.min(gameweeks.length, Math.max(Math.min(pageSize, gameweeks.length), gameweeks.length - pageOffset))
  const pageStart = Math.max(0, pageEnd - pageSize)
  const shownGws = gameweeks.slice(pageStart, pageEnd)
  const pageOlder = () => setPageOffset(gameweeks.length - pageEnd + 1)
  const pageNewer = () => setPageOffset(Math.max(0, gameweeks.length - pageEnd - 1))

  const colors = useMemo(() => buildColorMap(rows ?? []), [rows])
  const moves = useMemo(() => (rows ? rankMoves(rows, gameweeks) : new Map()), [rows, gameweeks])
  const awardList = useMemo(() => (rows ? buildAwards(rows, gameweeks, moves) : []), [rows, gameweeks, moves])
  const { squads, failed, request: requestSquads } = useSquads({ leagueId: LEAGUE_ID, live })
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
      {rows && (
        <LatestScores
          rows={rows}
          gw={latestGw}
          liveGw={liveGw}
          colors={colors}
          squadData={squads[latestGw]}
          styleFor={(points) => cellStyle(points, gwStats[latestGw] ?? { min: 0, max: 0 })}
        />
      )}
      <h2>
        <button type="button" className="recap-toggle" aria-expanded={recapOpen} onClick={() => setRecapOpen((open) => !open)}>
          Gameweek Recaps
          <span className="recap-hint">{recapOpen ? 'Click to hide' : 'Click to read'}</span>
        </button>
      </h2>
      {recapOpen && (
        <>
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
        </>
      )}
      {savedCopy && (
        <p className="status saved-note">FPL is updating right now, so this is the last data we could get. It will refresh by itself.</p>
      )}
      {error && (
        <p className="status error">
          Couldn&apos;t load the league data ({error}). FPL may be updating.{' '}
          <button type="button" className="gw-pill" onClick={() => window.location.reload()}>
            Try again
          </button>
        </p>
      )}
      {!error && !rows && <p className="status">Loading gameweek scores…</p>}
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

      {rows && shownGws.length > 0 && (
        <div className="table-pager">
          <button type="button" className="gw-pill" onClick={pageOlder} disabled={pageStart === 0} aria-label="Earlier gameweeks">
            ‹
          </button>
          <span className="table-pager-range">
            GW{shownGws[0]}
            {shownGws.length > 1 && `–GW${shownGws.at(-1)}`}
          </span>
          <button type="button" className="gw-pill" onClick={pageNewer} disabled={pageEnd === gameweeks.length} aria-label="Later gameweeks">
            ›
          </button>
        </div>
      )}

      {rows && tableTab === 'gameweek' && (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Manager</th>
                  {shownGws.map((gw) => (
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
                    {shownGws.map((gw) => (
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

      {cumulativeRows && tableTab === 'cumulative' && (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Manager</th>
                  {shownGws.map((gw) => (
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
                    {shownGws.map((gw) => (
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
                  {shownGws.map((gw) => (
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
                    {shownGws.map((gw) => {
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
                  {shownGws.map((gw) => (
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
                    {shownGws.map((gw) => (
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
          requestSquads={requestSquads}
          live={live}
          liveGw={liveGw}
          colors={colors}
        />
      )}

      {rows && <Awards awards={awardList} colors={colors} />}
    </>
  )
}
