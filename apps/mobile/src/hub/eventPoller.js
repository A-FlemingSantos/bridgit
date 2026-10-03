// Polls /api/hub/events. React Native cannot read a streaming fetch body, so the SSE endpoint is not used.
// Starts from the current head so historic writes are never replayed, then delivers each event once.
export function createEventPoller({
  getToken,
  fetchHead,
  fetchEvents,
  onEvents,
  onUnauthorized,
  intervalMs = 5000,
  retryMs = 3000,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let sequence = null
  let timer = null
  let running = false

  function schedule(delay) {
    if (!running) return
    clearTimer(timer)
    timer = setTimer(tick, delay)
  }

  async function tick() {
    if (!running) return
    const token = getToken()
    if (!token) return

    try {
      if (sequence === null) {
        sequence = Number(await fetchHead(token)) || 0
        schedule(intervalMs)
        return
      }

      const events = (await fetchEvents(token, sequence)) ?? []
      const fresh = events.filter((event) => Number.isFinite(event?.sequence) && event.sequence > sequence)
      if (fresh.length > 0 && running) {
        sequence = Math.max(...fresh.map((event) => event.sequence))
        onEvents(fresh)
      }
      // A full page means more events are waiting; fetch the next page right away.
      schedule(events.length >= 200 ? 0 : intervalMs)
    } catch (error) {
      if (error?.status === 401) {
        running = false
        onUnauthorized?.(error)
        return
      }
      schedule(retryMs)
    }
  }

  return {
    start() {
      if (running) return
      running = true
      schedule(0)
    },
    stop() {
      running = false
      clearTimer(timer)
      timer = null
    },
  }
}
