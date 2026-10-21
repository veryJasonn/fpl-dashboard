import { useCallback, useMemo, useRef, useState } from 'react'
import { fetchJson } from './fetchJson.js'

const CONCURRENCY = 3

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
      running.current += 1
      fetchJson(`/api/leagues-classic/${leagueId}/live?event=${gw}`)
        .then((data) => {
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
