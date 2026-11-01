import { useCallback, useMemo, useRef, useState } from 'react'
import { fetchJson } from './fetchJson.js'

const CONCURRENCY = 3

// Finalised gameweeks never change, so they are kept in localStorage and only ever downloaded once per
// device. Bump the version if the squad shape changes.
const storageKey = (leagueId, gw) => `fpl-squad:v1:${leagueId}:${gw}`

function readStored(leagueId, gw) {
  try {
    const raw = window.localStorage.getItem(storageKey(leagueId, gw))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeStored(leagueId, gw, data) {
  try {
    window.localStorage.setItem(storageKey(leagueId, gw), JSON.stringify(data))
  } catch {
    // Storage full or unavailable: just fetch next time.
  }
}

// Squads per gameweek. The current gameweek arrives with the live poll; past ones are fetched on demand
// via request(), once each, from the same endpoint (the server caches finished gameweeks for a day).
// Nothing is fetched until it's asked for, so a normal page load makes no squad requests at all.
export function useSquads({ leagueId, live }) {
  const [fetched, setFetched] = useState({})
  const [failed, setFailed] = useState({})
  const requested = useRef(new Set())
  const queue = useRef([])
  const running = useRef(0)
  const currentEvent = live?.event ?? null
  const currentEventRef = useRef(currentEvent)
  currentEventRef.current = currentEvent

  const pump = useCallback(() => {
    while (running.current < CONCURRENCY && queue.current.length > 0) {
      const gw = queue.current.shift()
      const stored = readStored(leagueId, gw)
      if (stored) {
        setFetched((prev) => ({ ...prev, [gw]: stored }))
        continue
      }
      running.current += 1
      fetchJson(`/api/leagues-classic/${leagueId}/live?event=${gw}`)
        .then((data) => {
          if (data.final) writeStored(leagueId, gw, data)
          setFetched((prev) => ({ ...prev, [gw]: data }))
          setFailed((prev) => ({ ...prev, [gw]: false }))
        })
        .catch(() => {
          requested.current.delete(gw)
          setFailed((prev) => ({ ...prev, [gw]: true }))
        })
        .finally(() => {
          running.current -= 1
          pump()
        })
    }
  }, [leagueId])

  // urgent requests (a gameweek the user just picked) jump the queue ahead of background loading.
  const request = useCallback(
    (gameweeks, { urgent = false } = {}) => {
      const wanted = [...gameweeks].sort((a, b) => b - a).filter((gw) => gw !== currentEventRef.current && !requested.current.has(gw))
      wanted.forEach((gw) => requested.current.add(gw))
      queue.current = urgent ? [...wanted, ...queue.current] : [...queue.current, ...wanted]
      pump()
    },
    [pump],
  )

  const squads = useMemo(() => (currentEvent != null && live ? { ...fetched, [currentEvent]: live } : fetched), [fetched, currentEvent, live])

  return { squads, failed, request }
}
