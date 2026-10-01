const DB_NAME = 'bridgit-hub-storage'
const DB_VERSION = 1

let databasePromise = null

export function requestAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
  })
}

export function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'))
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'))
  })
}

export function openHubDatabase() {
  if (!globalThis.indexedDB) return Promise.resolve(null)
  if (databasePromise) return databasePromise

  databasePromise = new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('catalog')) db.createObjectStore('catalog', { keyPath: 'userId' })
      if (!db.objectStoreNames.contains('content')) {
        const content = db.createObjectStore('content', { keyPath: 'key' })
        content.createIndex('byUser', 'userId', { unique: false })
        content.createIndex('byConnection', 'connectionScope', { unique: false })
      }
      if (!db.objectStoreNames.contains('epochs')) db.createObjectStore('epochs', { keyPath: 'key' })
      if (!db.objectStoreNames.contains('leases')) db.createObjectStore('leases', { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Unable to open IndexedDB.'))
    request.onblocked = () => reject(new Error('IndexedDB upgrade is blocked.'))
  }).catch(() => null)

  return databasePromise
}

export async function readRecord(storeName, key) {
  const db = await openHubDatabase()
  if (!db) return null
  try {
    const transaction = db.transaction(storeName, 'readonly')
    return (await requestAsPromise(transaction.objectStore(storeName).get(key))) ?? null
  } catch {
    return null
  }
}

export async function readAllRecords(storeName) {
  const db = await openHubDatabase()
  if (!db) return []
  try {
    const transaction = db.transaction(storeName, 'readonly')
    return await requestAsPromise(transaction.objectStore(storeName).getAll())
  } catch {
    return []
  }
}

export async function writeRecords(storeNames, callback) {
  const db = await openHubDatabase()
  if (!db) return false
  try {
    const transaction = db.transaction(storeNames, 'readwrite')
    const result = await callback(transaction)
    await transactionDone(transaction)
    return result
  } catch {
    return false
  }
}

export const HUB_STORAGE_DB_NAME = DB_NAME
