import { IDBFactory } from 'fake-indexeddb'
import { Blob as NodeBlob } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let store
let idb
const descriptor = () => ({ userId: 'user', connectionId: 'connection', generation: 1, ref: 'item',
  revision: 'rev-1', variant: 'ORIGINAL', size: 4, authorizedUntil: new Date(Date.now() + 60000).toISOString() })
const snapshot = () => ({
  providersState: { status: 'ready', providers: [{ id: 'onedrive', connected: true, connectionId: 'connection', generation: 1 }] },
  folderCache: { 'onedrive:root': { generation: 7, status: 'ready', loaded: true, items: [{ provider: 'onedrive', ref: 'item', name: 'A.txt' }] } },
  itemCache: { 'onedrive:item': { generation: 11, complete: true, item: { provider: 'onedrive', ref: 'item', name: 'A.txt', ancestry: [] } } },
  recentsState: { entries: [] }, shortcutsState: { entries: [] },
})

beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('Blob', NodeBlob)
  vi.stubGlobal('navigator', { storage: { estimate: async () => ({ quota: 1024 * 1024 * 1024 }) } })
  store = await import('./index.js')
  idb = await import('./idb.js')
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('persistent storage with real IndexedDB transactions', () => {
  it('round-trips normalized queries without conflating request generation and connection identity', async () => {
    await store.saveCatalog('user', snapshot())
    const persisted = await idb.readRecord('catalog', 'user')
    expect(persisted.snapshot.format).toBe(2)
    expect(Object.keys(persisted.snapshot.entities)).toHaveLength(1)
    expect(persisted.snapshot.folderQueries['onedrive:root'].items).toBeUndefined()
    const restored = await store.loadCatalog('user')
    expect(restored.folderCache['onedrive:root'].generation).toBe(7)
    expect(restored.itemCache['onedrive:item'].generation).toBe(11)
    expect(restored.folderCache['onedrive:root'].items[0].ancestry).toEqual([])
    expect(await store.loadCatalog('other')).toBeNull()
  })

  it('never restores an interrupted request as permanently loading or revalidating', async () => {
    const pending = snapshot()
    pending.providersState.status = 'loading'
    pending.folderCache['onedrive:root'].revalidating = true
    pending.folderCache['onedrive:root'].isFetchingNextPage = true
    pending.itemCache['onedrive:item'].revalidating = true
    pending.recentsState = { status: 'loading', entries: [], authoritative: false }
    await store.saveCatalog('user', pending)
    const restored = await store.loadCatalog('user')
    expect(restored.providersState.status).toBe('ready')
    expect(restored.folderCache['onedrive:root']).toMatchObject({ status: 'ready', revalidating: false, isFetchingNextPage: false, fetchedAt: 0 })
    expect(restored.itemCache['onedrive:item']).toMatchObject({ status: 'ready', revalidating: false, fetchedAt: 0 })
    expect(restored.recentsState.status).toBe('idle')
  })

  it('reuses bytes after the original authorization expires when a new descriptor authorizes the same revision', async () => {
    const first = descriptor()
    expect(await store.putContent(first, new Blob(['data']))).toBe(true)
    const record = await idb.readRecord('content', store.contentKey(first))
    await idb.writeRecords(['content'], (tx) => tx.objectStore('content').put({ ...record, authorizedUntil: '2000-01-01T00:00:00Z' }))
    expect((await store.getContent(descriptor()))?.size).toBe(4)
    expect(await store.getContent({ ...first, authorizedUntil: '2000-01-01T00:00:00Z' })).toBeNull()
    expect(await store.getContent({ ...first, revision: 'rev-2' })).toBeNull()
  })

  it('purges a connection and a user without restoring stale bytes', async () => {
    await store.saveCatalog('user', snapshot())
    await store.putContent(descriptor(), new Blob(['data']))
    await store.clearConnectionStorage('user', 'connection', 1)
    expect(await store.getContent(descriptor())).toBeNull()
    expect((await store.loadCatalog('user')).folderCache).toEqual({})
    await store.saveCatalog('user', snapshot())
    await store.clearUserStorage('user')
    expect(await store.loadCatalog('user')).toBeNull()
  })

  it('does not block active reading when browser persistence is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined)
    await expect(store.withContentLock(descriptor(), async () => 'streamed')).resolves.toBe('streamed')
  })

  it('rejects unknown lengths, partial bytes and expired descriptors', async () => {
    expect(await store.putContent({ ...descriptor(), size: null }, new Blob([]))).toBe(false)
    expect(await store.putContent(descriptor(), new Blob(['partial']))).toBe(false)
    expect(await store.putContent({ ...descriptor(), authorizedUntil: '2000-01-01T00:00:00Z' }, new Blob(['data']))).toBe(false)
  })
})
