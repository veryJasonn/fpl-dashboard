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
