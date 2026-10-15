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

  it('prefixes the stream path with VITE_API_BASE_URL', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://bridgit-demo.duckdns.org/')
    expect(await connectedUrl()).toBe('https://bridgit-demo.duckdns.org/api/hub/events/stream?after=7')
  })
})
