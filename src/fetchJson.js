const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// GET a JSON endpoint, retrying a couple of times on network errors, 429 and 5xx so a brief hiccup
// doesn't surface as an error. Other failures (e.g. 404) are thrown straight away.
export async function fetchJson(url, { retries = 2, delayMs = 700 } = {}) {
  let lastError
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let retryable = true
    try {
      const res = await fetch(url)
      if (res.ok) return await res.json()
      lastError = new Error(`Request failed: ${res.status}`)
      retryable = res.status >= 500 || res.status === 429
    } catch (err) {
      lastError = err
    }
    if (!retryable || attempt === retries) break
    await sleep(delayMs * (attempt + 1))
  }
  throw lastError
}
