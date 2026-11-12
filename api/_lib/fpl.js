const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// fetch() that retries when FPL is briefly overloaded or being updated (network errors, 429, 5xx).
// Other statuses (including 404) are returned immediately. After the last attempt the failing
// response is returned so callers can pass its status along.
export async function fplFetch(url, { retries = 2, delayMs = 300 } = {}) {
  let last
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url)
      if (res.status < 500 && res.status !== 429) return res
      last = res
    } catch (err) {
      last = err
    }
    if (attempt < retries) await sleep(delayMs * (attempt + 1))
  }
  if (last instanceof Error) throw last
  return last
}

export const FPL_API = 'https://fantasy.premierleague.com/api'

export async function fplJson(path, options) {
  const res = await fplFetch(`${FPL_API}${path}`, options)
  if (!res.ok) {
    const err = new Error(`FPL API returned ${res.status} for ${path}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

// Last successful response per path. If FPL is down or "being updated" we serve this instead of an error,
// so the page keeps showing the latest data we managed to get. Production only (it lives per warm
// serverless instance; the edge cache's stale-if-error covers cold instances), so local development
// still surfaces real failures.
const lastGood = new Map()
const KEEP_LAST_GOOD = process.env.NODE_ENV === 'production'

export async function fplJsonOrLast(path, options) {
  try {
    const data = await fplJson(path, options)
    if (KEEP_LAST_GOOD) lastGood.set(path, data)
    return data
  } catch (err) {
    if (lastGood.has(path)) return lastGood.get(path)
    throw err
  }
}

// Shares one download between concurrent callers and keeps it for a few minutes on a warm
// serverless instance, so e.g. the 1.7MB bootstrap-static isn't re-downloaded by every request.
// Failures are never kept. Disabled outside production so local development always sees fresh data.
const memo = new Map()
const MEMO_TTL_MS = process.env.NODE_ENV === 'production' ? 5 * 60_000 : 0

export function cachedFplJson(path) {
  const hit = memo.get(path)
  if (hit && Date.now() - hit.at < MEMO_TTL_MS) return hit.promise
  const promise = fplJsonOrLast(path)
  const entry = { promise, at: Date.now() }
  memo.set(path, entry)
  promise.catch(() => {
    if (memo.get(path) === entry) memo.delete(path)
  })
  return promise
}
