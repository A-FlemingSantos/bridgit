import { getHubEvents, getHubEventHead } from '@bridgit/shared-client'

/** Replayable, bounded authenticated streams; polling recovers networks without streaming. */
export function subscribeServerEvents(getToken, onEvent, { signal, fetchImpl = globalThis.fetch } = {}) {
  let sequence = 0
  let closed = false
  let timer
  const abort = new AbortController()
  const stop = () => { closed = true; clearTimeout(timer); abort.abort() }
  signal?.addEventListener('abort', stop, { once: true })
  const deliver = (event) => {
    if (closed || !Number.isFinite(event?.sequence) || event.sequence <= sequence) return
    sequence = event.sequence
    onEvent(event)
  }
  async function connect() {
    if (closed || !getToken()) return
    try {
      const response = await fetchImpl(`/api/hub/events/stream?after=${sequence}`, {
        headers: { Authorization: `Bearer ${getToken()}` }, signal: abort.signal,
      })
      if (!response.ok || !response.body?.getReader) throw new Error('stream unavailable')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (!closed) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true }).replaceAll('\r\n', '\n')
        let separator
        while ((separator = buffer.indexOf('\n\n')) >= 0) {
          const message = buffer.slice(0, separator)
          buffer = buffer.slice(separator + 2)
          for (const line of message.split('\n')) if (line.startsWith('data:')) {
            try { deliver(JSON.parse(line.slice(5).trim())) } catch { /* heartbeat/malformed event */ }
          }
        }
      }
    } catch {
      if (!closed) {
        try { for (const event of await getHubEvents(getToken(), sequence, abort.signal) ?? []) deliver(event) } catch { /* retry below */ }
      }
    }
    if (!closed) timer = setTimeout(connect, 3000)
  }
  async function bootstrap() {
    if (closed || !getToken()) return
    try {
      sequence = await getHubEventHead(getToken(), abort.signal)
      if (closed) return
      // Refresh after capturing the head, then replay events newer than it. Never replay historic writes into the UI.
      onEvent({ type: 'reset', sequence })
      void connect()
    } catch { if (!closed) timer = setTimeout(bootstrap, 3000) }
  }
  void bootstrap()
  return () => { signal?.removeEventListener('abort', stop); stop() }
}
