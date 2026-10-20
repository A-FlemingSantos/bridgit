import { getHubEvents, getHubEventHead } from '@bridgit/shared-client'
import { resolveApiUrl } from '../config/apiBase.js'

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
    const startedAt = Date.now()
    let failed = false
    try {
      const response = await fetchImpl(resolveApiUrl(`/api/hub/events/stream?after=${sequence}`), {
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
      failed = true
      if (!closed) {
        try { for (const event of await getHubEvents(getToken(), sequence, abort.signal) ?? []) deliver(event) } catch { /* retry below */ }
      }
    }
    // The server closes every stream on purpose after a while; waiting before reopening it left a window
    // where changes arrived late. Only a failure, or a stream that ends at once, waits before trying again.
    if (!closed) timer = setTimeout(connect, failed || Date.now() - startedAt < 1000 ? 3000 : 0)
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
