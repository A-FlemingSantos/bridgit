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

vi.mock('../api/config', () => ({ apiOptions: { baseUrl: 'http://api.test' } }))

vi.mock('@bridgit/shared-client', () => ({ apiRequest: vi.fn() }))

const { apiRequest } = await import('@bridgit/shared-client')
const { createSessionManager } = await import('./sessionManager')

const mobileSession = (token) => ({
  accessToken: token,
  expiresAt: null,
  user: { username: 'ana' },
  session: { id: 's1', persistent: true, expiresAt: null, clientKind: 'mobile' },
})

function setup() {
  const changes = []
  const manager = createSessionManager({ onChange: (next) => changes.push(next) })
  return { manager, changes }
}

function httpError(status) {
  return Object.assign(new Error(`HTTP ${status}`), { status })
}

beforeEach(() => {
  storage.clear()
  vi.clearAllMocks()
})

describe('restore', () => {
  it('shows an old stored session without expiring it locally', async () => {
    const old = { ...mobileSession('old-token'), expiresAt: '2001-01-01T00:00:00Z' }
    storage.set('bridgit.session', JSON.stringify(old))
    const { manager, changes } = setup()

    expect(await manager.restore()).toEqual(old)
    expect(changes).toEqual([old])
    expect(manager.current()).toEqual(old)
    expect(storage.has('bridgit.session')).toBe(true)
    expect(apiRequest).not.toHaveBeenCalled()
  })

  it('stays signed out when nothing is stored', async () => {
    const { manager, changes } = setup()
    expect(await manager.restore()).toBeNull()
    expect(changes).toEqual([])
  })
})

describe('revalidate', () => {
  async function restored() {
    storage.set('bridgit.session', JSON.stringify(mobileSession('t1')))
    const ctx = setup()
    await ctx.manager.restore()
    ctx.changes.length = 0
    return ctx
  }

  it('revalidates through /api/auth/refresh and stores the returned session', async () => {
    const { manager, changes } = await restored()
    apiRequest.mockResolvedValueOnce(mobileSession('t2'))

    await manager.revalidate()

    expect(apiRequest).toHaveBeenCalledWith(
      '/api/auth/refresh',
      expect.objectContaining({ method: 'POST', token: 't1' }),
    )
    expect(changes).toEqual([mobileSession('t2')])
    expect(JSON.parse(storage.get('bridgit.session')).accessToken).toBe('t2')
  })

  it('ends the session and clears storage on 401', async () => {
    const { manager, changes } = await restored()
    apiRequest.mockRejectedValueOnce(httpError(401))

    await manager.revalidate()
    await Promise.resolve()

    expect(manager.current()).toBeNull()
    expect(changes).toEqual([null])
    expect(storage.has('bridgit.session')).toBe(false)
  })

  it('keeps the session on a network error', async () => {
    const { manager, changes } = await restored()
    apiRequest.mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'ERRO_CONEXAO' }))

    await manager.revalidate()

    expect(manager.current().accessToken).toBe('t1')
    expect(changes).toEqual([])
    expect(storage.has('bridgit.session')).toBe(true)
  })

  it('keeps the session on a server error', async () => {
    const { manager } = await restored()
    apiRequest.mockRejectedValueOnce(httpError(503))

    await manager.revalidate()

    expect(manager.current().accessToken).toBe('t1')
  })

  it('ignores a stale 401 after the user signed in again', async () => {
    const { manager } = await restored()
    let reject
    apiRequest.mockReturnValueOnce(new Promise((_, r) => { reject = r }))

    const pending = manager.revalidate()
    apiRequest.mockResolvedValueOnce(mobileSession('t9'))
    await manager.login({ username: 'ana', password: 'pw' })
    reject(httpError(401))
    await pending

    expect(manager.current().accessToken).toBe('t9')
  })
})

describe('login and register', () => {
  it.each([
    ['login', '/api/auth/login'],
    ['register', '/api/auth/register'],
  ])('%s sends clientKind mobile, persistent true and the device key', async (method, path) => {
    const { manager, changes } = setup()
    apiRequest.mockResolvedValueOnce(mobileSession('t1'))

    await manager[method]({ username: 'ana', password: 'pw' })

    const [calledPath, options] = apiRequest.mock.calls[0]
    expect(calledPath).toBe(path)
    expect(options).toMatchObject({
      method: 'POST',
      baseUrl: 'http://api.test',
      body: { username: 'ana', password: 'pw', clientKind: 'mobile', persistent: true },
    })
    expect(options.body.deviceKey).toEqual(expect.any(String))
    expect(changes).toEqual([mobileSession('t1')])
  })

  it('persists the session even when the server reports persistent false', async () => {
    const { manager } = setup()
    const data = mobileSession('t1')
    data.session.persistent = false
    apiRequest.mockResolvedValueOnce(data)

    await manager.login({ username: 'ana', password: 'pw' })

    expect(JSON.parse(storage.get('bridgit.session')).accessToken).toBe('t1')
  })

  it('ignores a persistent flag passed by the caller', async () => {
    const { manager } = setup()
    apiRequest.mockResolvedValueOnce(mobileSession('t1'))

    await manager.login({ username: 'ana', password: 'pw', persistent: false })

    expect(apiRequest.mock.calls[0][1].body.persistent).toBe(true)
  })
})

describe('logout, end and replace', () => {
  it('logout clears locally and calls the server with the old token', async () => {
    const { manager } = setup()
    apiRequest.mockResolvedValueOnce(mobileSession('t1'))
    await manager.login({ username: 'ana', password: 'pw' })
    apiRequest.mockResolvedValueOnce({})

    await manager.logout()

    expect(manager.current()).toBeNull()
    expect(storage.has('bridgit.session')).toBe(false)
    expect(apiRequest).toHaveBeenLastCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST', token: 't1' }),
    )
  })

  it('end (invalidate) drops the session without calling the server', async () => {
    const { manager } = setup()
    apiRequest.mockResolvedValueOnce(mobileSession('t1'))
    await manager.login({ username: 'ana', password: 'pw' })
    apiRequest.mockClear()

    manager.end()

    expect(manager.current()).toBeNull()
    expect(apiRequest).not.toHaveBeenCalled()
  })

  it('replace stores the new session', async () => {
    const { manager } = setup()
    await manager.replace(mobileSession('t5'))
    expect(manager.current().accessToken).toBe('t5')
    expect(JSON.parse(storage.get('bridgit.session')).accessToken).toBe('t5')
  })
})
