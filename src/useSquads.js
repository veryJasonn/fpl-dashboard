import { useEffect, useMemo, useRef, useState } from 'react'

const CONCURRENCY = 3

// Squads for every gameweek: the current one comes from the live poll, past ones are
// fetched once (newest first) from the same endpoint and cached for the session.
export function useSquads({ leagueId, gameweeks, live }) {
  const [fetched, setFetched] = useState({})
  const [failed, setFailed] = useState({})
  const requested = useRef(new Set())
  const currentEvent = live?.event ?? null
  const key = gameweeks.join(',')

  useEffect(() => {
    const queue = [...gameweeks]
      .sort((a, b) => b - a)
      .filter((gw) => gw !== currentEvent && !requested.current.has(gw))
    queue.forEach((gw) => requested.current.add(gw))

    async function worker() {
      while (queue.length > 0) {
        const gw = queue.shift()
        try {
          const res = await fetch(`/api/leagues-classic/${leagueId}/live?event=${gw}`)
          if (!res.ok) throw new Error(`Request failed: ${res.status}`)
          const data = await res.json()
          setFetched((prev) => ({ ...prev, [gw]: data }))
          setFailed((prev) => ({ ...prev, [gw]: false }))
        } catch {
          requested.current.delete(gw)
          setFailed((prev) => ({ ...prev, [gw]: true }))
        }
      }
    }
    for (let i = 0; i < CONCURRENCY; i += 1) worker()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, key, currentEvent])

  const squads = useMemo(() => (currentEvent != null && live ? { ...fetched, [currentEvent]: live } : fetched), [fetched, currentEvent, live])
  const allLoaded = gameweeks.length > 0 && gameweeks.every((gw) => squads[gw])

  return { squads, failed, allLoaded }
}
