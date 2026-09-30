import { clearConnectionStorage as clearCatalogConnectionStorage, clearUserStorage as clearCatalogUserStorage, connectionEpochKey, userEpochKey } from './catalog.js'
import { openHubDatabase, readAllRecords, readRecord, requestAsPromise, transactionDone, writeRecords } from './idb.js'

const MIB = 1024 * 1024
const MAX_CONTENT_BYTES = 50 * MIB
const FALLBACK_BUDGET_BYTES = 100 * MIB
const MAX_BUDGET_BYTES = 512 * MIB
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000
const LEASE_MS = 15_000

function isStrongRevision(revision) {
  return typeof revision === 'string' && revision.length > 0 && !/^W\//i.test(revision)
}

function validAuthorization(authorizedUntil, now = Date.now()) {
  const time = Date.parse(authorizedUntil ?? '')
  return Number.isFinite(time) && time > now
}

function identity(descriptor) {
  if (!descriptor?.userId || !descriptor?.connectionId || descriptor?.generation === null || descriptor?.generation === undefined || !descriptor?.ref || !isStrongRevision(descriptor?.revision)) return null
  return {
    userId: String(descriptor.userId),
    connectionId: String(descriptor.connectionId),
    generation: String(descriptor.generation),
    ref: String(descriptor.ref),
    revision: String(descriptor.revision),
    variant: descriptor.variant == null ? '' : String(descriptor.variant),
  }
}

export function contentKey(descriptor) {
  const value = identity(descriptor)
  if (!value) return null
  return [value.userId, value.connectionId, value.generation, value.ref, value.revision, value.variant]
    .map(encodeURIComponent)
    .join('|')
}

function descriptorForStorage(descriptor) {
  const value = identity(descriptor)
  if (!value || !validAuthorization(descriptor?.authorizedUntil)) return null
  const size = Number(descriptor.size)
  if (descriptor.size == null || !Number.isInteger(size) || size < 0 || size > MAX_CONTENT_BYTES) return null
  return { ...value, authorizedUntil: new Date(descriptor.authorizedUntil).toISOString(), size }
}

function currentConnectionScope(record) {
  return `${record.userId}:${record.connectionId}:${record.generation}`
}

async function currentEpochs(record) {
  const [user, connection, generation] = await Promise.all([
    readRecord('epochs', userEpochKey(record.userId)),
    readRecord('epochs', connectionEpochKey(record.userId, record.connectionId)),
    readRecord('epochs', connectionEpochKey(record.userId, record.connectionId, record.generation)),
  ])
  return {
    userEpoch: user?.value ?? 0,
    connectionEpoch: connection?.value ?? 0,
    generationEpoch: generation?.value ?? 0,
  }
}

function epochsMatch(record, epochs) {
  return record.userEpoch === epochs.userEpoch && record.connectionEpoch === epochs.connectionEpoch && record.generationEpoch === epochs.generationEpoch
}

async function storageBudget() {
  try {
    const estimate = await globalThis.navigator?.storage?.estimate?.()
    if (Number.isFinite(estimate?.quota)) return Math.min(MAX_BUDGET_BYTES, Math.floor(estimate.quota * 0.2))
  } catch {
    // Browser storage estimates are advisory; the conservative fallback is enough.
  }
  return FALLBACK_BUDGET_BYTES
}

async function removeOpfsFile(path) {
  if (!path) return
  try {
    const root = await globalThis.navigator?.storage?.getDirectory?.()
    const directory = await root?.getDirectoryHandle('bridgit-hub-content-v1', { create: false })
    await directory?.removeEntry(path)
  } catch {
    // The IDB metadata is authoritative; orphan cleanup is best effort.
  }
}

async function writeOpfsBlob(blob) {
  try {
    const root = await globalThis.navigator?.storage?.getDirectory?.()
    if (!root) return null
    const directory = await root.getDirectoryHandle('bridgit-hub-content-v1', { create: true })
    const path = `content-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`
    const file = await directory.getFileHandle(path, { create: true })
    const writer = await file.createWritable()
    try {
      await writer.write(blob)
      await writer.close()
      return path
    } catch (error) {
      await writer.abort?.().catch(() => {})
      await directory.removeEntry(path).catch(() => {})
      throw error
    }
  } catch {
    return null
  }
}

async function readOpfsBlob(path) {
  try {
    const root = await globalThis.navigator?.storage?.getDirectory?.()
    const directory = await root?.getDirectoryHandle('bridgit-hub-content-v1', { create: false })
    return await (await directory?.getFileHandle(path)).getFile()
  } catch {
    return null
  }
}

async function pruneForBudget(additionalBytes) {
  const records = await readAllRecords('content')
  const budget = await storageBudget()
  const now = Date.now()
  const stale = records.filter((record) => now - (record.lastAccessed ?? record.createdAt ?? 0) > STALE_AFTER_MS)
  const live = records.filter((record) => !stale.includes(record))
  let used = live.reduce((sum, record) => sum + (record.size ?? 0), 0)
  const candidates = [...stale, ...live.sort((a, b) => (a.lastAccessed ?? 0) - (b.lastAccessed ?? 0))]
  const removed = []
  for (const record of candidates) {
    if (!stale.includes(record) && used + additionalBytes <= budget) break
    if (!stale.includes(record)) used -= record.size ?? 0
    removed.push(record)
  }
  if (used + additionalBytes > budget) return false
  if (!removed.length) return true
  const deleted = await writeRecords(['content'], async (transaction) => {
    const store = transaction.objectStore('content')
    removed.forEach((record) => store.delete(record.key))
  })
  if (deleted === false) return false
  await Promise.all(removed.map((record) => removeOpfsFile(record.path)))
  return true
}

export async function getContent(descriptor) {
  const key = contentKey(descriptor)
  if (!key || !validAuthorization(descriptor?.authorizedUntil)) return null
  const record = await readRecord('content', key)
  if (!record || !isStrongRevision(record.revision)) return null
  if (Date.now() - (record.lastAccessed ?? record.createdAt ?? 0) > STALE_AFTER_MS) return null
  const epochs = await currentEpochs(record)
  if (!epochsMatch(record, epochs)) return null
  const blob = record.backend === 'opfs' ? await readOpfsBlob(record.path) : record.blob
  if (!(blob instanceof Blob) || blob.size !== record.size || !epochsMatch(record, await currentEpochs(record))) return null
  void writeRecords(['content'], async (transaction) => {
    const stored = await requestAsPromise(transaction.objectStore('content').get(key))
    if (stored && epochsMatch(stored, epochs)) transaction.objectStore('content').put({ ...stored, lastAccessed: Date.now() })
  })
  return blob
}

export async function putContent(descriptor, blob) {
  const stored = descriptorForStorage(descriptor)
  if (!stored || !(blob instanceof Blob) || blob.size !== stored.size || blob.size > MAX_CONTENT_BYTES) return false
  if (!(await pruneForBudget(blob.size))) return false
  const key = contentKey(descriptor)
  const initialEpochs = await currentEpochs(stored)
  const path = await writeOpfsBlob(blob)
  const record = {
    ...stored,
    key,
    connectionScope: currentConnectionScope(stored),
    backend: path ? 'opfs' : 'idb',
    ...(path ? { path } : { blob }),
    ...initialEpochs,
    createdAt: Date.now(),
    lastAccessed: Date.now(),
  }
  const finalEpochs = await currentEpochs(stored)
  if (!epochsMatch(record, finalEpochs)) {
    await removeOpfsFile(path)
    return false
  }
  const existing = await readRecord('content', key)
  const wrote = await writeRecords(['content', 'epochs'], async (transaction) => {
    const epochs = transaction.objectStore('epochs')
    const keys = [userEpochKey(stored.userId), connectionEpochKey(stored.userId, stored.connectionId), connectionEpochKey(stored.userId, stored.connectionId, stored.generation)]
    const values = await Promise.all(keys.map((epoch) => requestAsPromise(epochs.get(epoch))))
    if (!epochsMatch(record, { userEpoch: values[0]?.value ?? 0, connectionEpoch: values[1]?.value ?? 0, generationEpoch: values[2]?.value ?? 0 })) return false
    transaction.objectStore('content').put(record)
    return true
  })
  if (wrote === false) {
    await removeOpfsFile(path)
    return false
  }
  if (existing?.backend === 'opfs' && existing.path !== path) await removeOpfsFile(existing.path)
  return true
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Operation aborted.', 'AbortError')
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timeout)
      reject(signal.reason ?? new DOMException('Operation aborted.', 'AbortError'))
    }, { once: true })
  })
}

async function acquireLease(key, signal) {
  if (!(await openHubDatabase())) return null
  const owner = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  while (true) {
    throwIfAborted(signal)
    const acquired = await writeRecords(['leases'], async (transaction) => {
      const store = transaction.objectStore('leases')
      const current = await requestAsPromise(store.get(key))
      if (current && current.expiresAt > Date.now()) return { acquired: false }
      store.put({ key, owner, expiresAt: Date.now() + LEASE_MS })
      return { acquired: true }
    })
    if (acquired === false) return null // unavailable storage must never block an active read
    if (acquired?.acquired) return owner
    await delay(80, signal)
  }
}

async function releaseLease(key, owner) {
  await writeRecords(['leases'], async (transaction) => {
    const store = transaction.objectStore('leases')
    const current = await requestAsPromise(store.get(key))
    if (current?.owner === owner) store.delete(key)
  })
}

async function withLease(key, callback, signal) {
  const owner = await acquireLease(key, signal)
  if (!owner) { throwIfAborted(signal); return callback() }
  const refresh = setInterval(() => {
    void writeRecords(['leases'], async (transaction) => {
      const store = transaction.objectStore('leases')
      const current = await requestAsPromise(store.get(key))
      if (current?.owner === owner) store.put({ ...current, expiresAt: Date.now() + LEASE_MS })
    })
  }, Math.floor(LEASE_MS / 2))
  try {
    throwIfAborted(signal)
    return await callback()
  } finally {
    clearInterval(refresh)
    await releaseLease(key, owner)
  }
}

export async function withContentLock(descriptor, callback, { signal } = {}) {
  const key = contentKey(descriptor)
  if (!key || typeof callback !== 'function') return undefined
  throwIfAborted(signal)
  const locks = globalThis.navigator?.locks
  if (typeof locks?.request === 'function') {
    return locks.request(`bridgit-hub-content:${key}`, { mode: 'exclusive', signal }, callback)
  }
  return withLease(key, callback, signal)
}

export async function clearUserStorage(userId) {
  const removed = await clearCatalogUserStorage(userId)
  await Promise.all((removed ?? []).map((record) => removeOpfsFile(record.path)))
}

export async function clearConnectionStorage(userId, connectionId, generation) {
  const removed = await clearCatalogConnectionStorage(userId, connectionId, generation)
  await Promise.all((removed ?? []).map((record) => removeOpfsFile(record.path)))
}
