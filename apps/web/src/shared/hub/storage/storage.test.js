import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeCatalogSnapshot } from './catalog.js'
import { contentKey, getContent, putContent, withContentLock } from './content.js'

const futureAuthorization = '2030-01-01T00:00:00.000Z'

function snapshot() {
  return {
    providersState: {
      status: 'ready',
      providers: [
        { id: 'onedrive', connected: true, connectionId: 'connection-a', generation: 3 },
        { id: 'dropbox', connected: false },
      ],
    },
    folderCache: {
      'onedrive:root': {
        query: { parent: null, sort: 'name' },
        complete: true,
        generation: 8,
        items: [
          { provider: 'onedrive', ref: 'report', name: 'Report' },
          { provider: 'onedrive', ref: 'report', name: 'Duplicate' },
          { provider: 'dropbox', ref: 'wrong-connection' },
        ],
      },
      'dropbox:root': { items: [{ provider: 'dropbox', ref: 'discarded' }] },
    },
    itemCache: {
      'onedrive:report': { complete: true, item: { provider: 'onedrive', ref: 'report' } },
      'dropbox:discarded': { complete: true, item: { provider: 'dropbox', ref: 'discarded' } },
    },
    recentsState: { entries: [{ provider: 'onedrive', ref: 'report' }, { provider: 'dropbox', ref: 'discarded' }] },
    shortcutsState: { entries: [{ provider: 'onedrive', ref: 'report' }] },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('catalog normalization', () => {
  it('scopes legacy provider keys, preserves ordering and rejects disconnected providers', () => {
    const normalized = normalizeCatalogSnapshot(snapshot())

    expect(normalized.folderCache['onedrive:root']).toMatchObject({
      query: { parent: null, sort: 'name' },
      complete: true,
      catalog: expect.objectContaining({ connectionId: 'connection-a', generation: '3' }),
      generation: 8,
    })
    expect(normalized.folderCache['onedrive:root'].items).toEqual([
      expect.objectContaining({ ref: 'report', catalog: expect.objectContaining({ connectionId: 'connection-a', generation: '3' }) }),
    ])
    expect(normalized.folderCache['dropbox:root']).toBeUndefined()
    expect(normalized.itemCache).toEqual({
      'onedrive:report': expect.objectContaining({ complete: true, catalog: expect.objectContaining({ connectionId: 'connection-a' }) }),
    })
    expect(normalized.recentsState.entries).toHaveLength(1)
    expect(normalized.shortcutsState.entries[0]).toMatchObject({ ref: 'report', catalog: { generation: '3' } })
  })

  it('does not preserve authorization URLs or tokens in the catalog', () => {
    const input = snapshot()
    input.providersState.providers[0].authorizationUrl = 'https://provider.example/authorize'
    input.providersState.providers[0].link = 'https://provider.example/account'
    input.itemCache['onedrive:report'].item.accessToken = 'secret'

    const normalized = normalizeCatalogSnapshot(input)
    expect(normalized.providersState.providers[0].authorizationUrl).toBeUndefined()
    expect(normalized.providersState.providers[0].link).toBeUndefined()
    expect(normalized.itemCache['onedrive:report'].item.accessToken).toBeUndefined()
  })
})

describe('content storage contract', () => {
  const descriptor = {
    userId: 'user-a',
    connectionId: 'connection-a',
    generation: 3,
    ref: 'report',
    revision: '"revision-1"',
    variant: 'preview',
    authorizedUntil: futureAuthorization,
    size: 4,
  }

  it('uses scoped identities and rejects weak revisions', () => {
    expect(contentKey(descriptor)).toContain('connection-a')
    expect(contentKey({ ...descriptor, generation: 4 })).not.toBe(contentKey(descriptor))
    expect(contentKey({ ...descriptor, revision: 'W/"revision-1"' })).toBeNull()
  })

  it('fails closed when browser storage is unavailable', async () => {
    const original = globalThis.indexedDB
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined })
    try {
      expect(await getContent(descriptor)).toBeNull()
      expect(await putContent(descriptor, new Blob(['data']))).toBe(false)
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: original })
    }
  })

  it('uses navigator locks when they are available', async () => {
    const request = vi.fn(async (_key, _options, callback) => callback())
    Object.defineProperty(globalThis.navigator, 'locks', { configurable: true, value: { request } })

    await expect(withContentLock(descriptor, () => 'filled')).resolves.toBe('filled')
    expect(request).toHaveBeenCalledWith(expect.stringContaining('bridgit-hub-content:'), expect.any(Object), expect.any(Function))
  })
})
