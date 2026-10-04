import { beforeEach, describe, expect, it, vi } from 'vitest'

const storage = new Map()

vi.mock('./secureStorage', () => ({
  getItem: vi.fn(async (key) => storage.get(key) ?? null),
  setItem: vi.fn(async (key, value) => {
    storage.set(key, value)
  }),
  removeItem: vi.fn(async (key) => {
    storage.delete(key)
  }),
}))

const store = await import('./sessionStore')

beforeEach(() => storage.clear())

describe('sessionStore', () => {
  it('has no local expiry logic', () => {
    expect(store.isSessionExpired).toBeUndefined()
  })

  it('keeps an old session with a past expiresAt exactly as stored', async () => {
    const old = {
      accessToken: 'token',
      expiresAt: '2001-01-01T00:00:00Z',
      user: { username: 'ana' },
      session: { id: 's1', persistent: true, expiresAt: null, clientKind: 'mobile' },
    }
    await store.writeSession(old)
    expect(await store.readSession()).toEqual(old)
  })

  it('builds the stored session from a mobile response with null expiry', () => {
    const data = {
      accessToken: 'token',
      expiresAt: null,
      user: { username: 'ana' },
      session: { id: 's1', persistent: true, expiresAt: null, clientKind: 'mobile' },
      extra: 'ignored',
    }
    expect(store.buildStoredSession(data)).toEqual({
      accessToken: 'token',
      expiresAt: null,
      user: { username: 'ana' },
      session: data.session,
    })
  })

  it('returns null for missing or corrupt data and clears the session', async () => {
    expect(await store.readSession()).toBeNull()
    storage.set('bridgit.session', '{not json')
    expect(await store.readSession()).toBeNull()
    await store.writeSession({ accessToken: 't' })
    await store.clearSession()
    expect(await store.readSession()).toBeNull()
  })

  it('creates a device key once and reuses it', async () => {
    const first = await store.getDeviceKey()
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(await store.getDeviceKey()).toBe(first)
  })
})
