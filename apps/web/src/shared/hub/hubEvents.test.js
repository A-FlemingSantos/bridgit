import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@bridgit/shared-client', () => ({
  getHubEvents: vi.fn(async () => []),
  getHubEventHead: vi.fn(async () => 7),
}))

import { subscribeServerEvents } from './hubEvents.js'

function neverEndingFetch() {
  return vi.fn(async () => ({ ok: true, body: { getReader: () => ({ read: () => new Promise(() => {}) }) } }))
}

async function connectedUrl() {
  const fetchImpl = neverEndingFetch()
  const stop = subscribeServerEvents(() => 'token', vi.fn(), { fetchImpl })
  await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled())
  stop()
  return fetchImpl.mock.calls[0][0]
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('subscribeServerEvents', () => {
  it('uses the relative stream path when no API base is configured', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    expect(await connectedUrl()).toBe('/api/hub/events/stream?after=7')
  })

  it('reopens a stream the server closed normally without waiting', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
    try {
      let release
      const fetchImpl = vi.fn(async () => ({
        ok: true,
        body: { getReader: () => ({ read: () => new Promise((resolve) => { release = () => resolve({ done: true }) }) }) },
      }))
      const stop = subscribeServerEvents(() => 'token', vi.fn(), { fetchImpl })
      await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1))
      vi.setSystemTime(Date.now() + 25_000)
      release()
      await vi.advanceTimersByTimeAsync(0)
      expect(fetchImpl).toHaveBeenCalledTimes(2)
      stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('waits before reopening a stream that failed', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
    try {
      const fetchImpl = vi.fn(async () => ({ ok: false }))
      const stop = subscribeServerEvents(() => 'token', vi.fn(), { fetchImpl })
      await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1))
      await vi.advanceTimersByTimeAsync(2_000)
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1_500)
      expect(fetchImpl).toHaveBeenCalledTimes(2)
      stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('prefixes the stream path with VITE_API_BASE_URL', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://bridgit-demo.duckdns.org/')
    expect(await connectedUrl()).toBe('https://bridgit-demo.duckdns.org/api/hub/events/stream?after=7')
  })
})
