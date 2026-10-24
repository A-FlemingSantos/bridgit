import { IDBFactory } from 'fake-indexeddb'
import { Blob as NodeBlob } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let store
let idb
const descriptor = () => ({ userId: 'user', connectionId: 'connection', generation: 1, ref: 'item',
  revision: 'rev-1', variant: 'ORIGINAL', size: 4, authorizedUntil: new Date(Date.now() + 60000).toISOString() })
const snapshot = () => ({
  providersState: { status: 'ready', providers: [{ id: 'onedrive', connected: true, connections: [{ provider: 'onedrive', connectionId: 'connection', generation: 1 }] }] },
  folderCache: { 'connection:root': { generation: 7, status: 'ready', loaded: true, items: [{ connectionId: 'connection', provider: 'onedrive', ref: 'item', name: 'A.txt' }] } },
  itemCache: { 'connection:item': { generation: 11, complete: true, item: { connectionId: 'connection', provider: 'onedrive', ref: 'item', name: 'A.txt', ancestry: [] } } },
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
    expect(persisted.snapshot.folderQueries['connection:root'].items).toBeUndefined()
    const restored = await store.loadCatalog('user')
    expect(restored.folderCache['connection:root'].generation).toBe(7)
    expect(restored.itemCache['connection:item'].generation).toBe(11)
    expect(restored.folderCache['connection:root'].items[0].ancestry).toEqual([])
    expect(await store.loadCatalog('other')).toBeNull()
  })

  it('stamps the saved record with its format and drops a record saved under another one', async () => {
    await store.saveCatalog('user', snapshot())
    const persisted = await idb.readRecord('catalog', 'user')
    expect(persisted.format).toBe(2)
    expect(await store.loadCatalog('user')).not.toBeNull()

    await idb.writeRecords(['catalog'], (tx) => tx.objectStore('catalog').put({ ...persisted, format: undefined }))
    expect(await store.loadCatalog('user')).toBeNull()
    await idb.writeRecords(['catalog'], (tx) => tx.objectStore('catalog').put({ ...persisted, format: 1 }))
    expect(await store.loadCatalog('user')).toBeNull()
  })

  it('keeps the other accounts of a provider when one account is purged', async () => {
    const two = snapshot()
    two.providersState.providers[0].connections.push({ provider: 'onedrive', connectionId: 'second', generation: 4 })
    two.folderCache['second:root'] = { loaded: true, items: [{ connectionId: 'second', provider: 'onedrive', ref: 'other', name: 'B.txt' }] }
    await store.saveCatalog('user', two)
    await store.clearConnectionStorage('user', 'connection')
    const restored = await store.loadCatalog('user')
    expect(Object.keys(restored.folderCache)).toEqual(['second:root'])
    expect(Object.keys(restored.itemCache)).toEqual([])
  })

  it('never restores an interrupted request as permanently loading or revalidating', async () => {
    const pending = snapshot()
    pending.providersState.status = 'loading'
    pending.folderCache['connection:root'].revalidating = true
    pending.folderCache['connection:root'].isFetchingNextPage = true
    pending.itemCache['connection:item'].revalidating = true
    pending.recentsState = { status: 'loading', entries: [], authoritative: false }
    await store.saveCatalog('user', pending)
    const restored = await store.loadCatalog('user')
    expect(restored.providersState.status).toBe('ready')
    expect(restored.folderCache['connection:root']).toMatchObject({ status: 'ready', revalidating: false, isFetchingNextPage: false, fetchedAt: 0 })
    expect(restored.itemCache['connection:item']).toMatchObject({ status: 'ready', revalidating: false, fetchedAt: 0 })
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

  it('keeps a revision preview, or that it has none, apart from the file bytes', async () => {
    const thumb = { userId: 'user', connectionId: 'connection', generation: 1, ref: 'item', revision: 'rev-1' }
    expect(await store.getThumbnail(thumb)).toBeNull()
    expect(await store.putThumbnail(thumb, new Blob(['jpg']))).toBe(true)
    expect((await store.getThumbnail(thumb))?.blob?.size).toBe(3)
    expect(await store.getContent(descriptor())).toBeNull()
    expect(await store.getThumbnail({ ...thumb, revision: 'rev-2' })).toBeNull()
    expect(await store.putThumbnail({ ...thumb, ref: 'other' }, null)).toBe(true)
    expect(await store.getThumbnail({ ...thumb, ref: 'other' })).toEqual({ missing: true })
    await store.clearConnectionStorage('user', 'connection', 1)
    expect(await store.getThumbnail(thumb)).toBeNull()
  })

  it('asks the cloud again an hour after it said a revision has no preview', async () => {
    const thumb = { userId: 'user', connectionId: 'connection', generation: 1, ref: 'item', revision: 'rev-1' }
    await store.putThumbnail(thumb, null)
    const record = (await idb.readAllRecords('content'))[0]
    await idb.writeRecords(['content'], (tx) => tx.objectStore('content').put({ ...record, lastAccessed: Date.now() - 61 * 60 * 1000 }))
    expect(await store.getThumbnail(thumb)).toBeNull()
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
