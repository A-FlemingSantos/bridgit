import { useCallback, useSyncExternalStore } from 'react'
import { useSession } from '../../shared/auth/SessionContext.jsx'
import { useConnections } from '../../shared/hub/index.js'
import { oldestConnectionOf } from './connectionLabel.js'

// Muted, neutral tones; the first one is the default carbon folder.
export const FOLDER_COLORS = [
  { id: 'carbon', label: 'Carvão', hex: '#333333' },
  { id: 'graphite', label: 'Grafite', hex: '#4a4a4a' },
  { id: 'stone', label: 'Pedra', hex: '#958f86' },
  { id: 'bone', label: 'Osso', hex: '#c9c2b6', light: true },
  { id: 'slate', label: 'Ardósia', hex: '#5b6672' },
  { id: 'mist', label: 'Névoa', hex: '#8d9aa4' },
  { id: 'sage', label: 'Sálvia', hex: '#808c78' },
  { id: 'moss', label: 'Musgo', hex: '#56604f' },
  { id: 'sand', label: 'Areia', hex: '#b3a07f', light: true },
  { id: 'clay', label: 'Argila', hex: '#9f735e' },
  { id: 'rose', label: 'Rosé', hex: '#a58a88' },
  { id: 'plum', label: 'Ameixa', hex: '#6c5a69' },
]

export const DEFAULT_FOLDER_COLOR = FOLDER_COLORS[0]

const STORAGE_PREFIX = 'bridgit.folderColors.'
const EMPTY = Object.freeze({})
const cache = new Map()
const listeners = new Set()

function storageKey(userId) {
  return `${STORAGE_PREFIX}${userId}`
}

// Colors are kept per account: two accounts of one provider can hold folders that share a ref.
function entryKey(connectionId, ref) {
  return `${connectionId}:${ref}`
}

// Colors live in this browser only, per user; they do not sync across devices.
function read(userId) {
  if (!userId) return EMPTY
  if (cache.has(userId)) return cache.get(userId)
  let colors = EMPTY
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(userId)) ?? 'null')
    if (parsed && typeof parsed === 'object') colors = parsed
  } catch {
    // Unreadable or blocked storage just means no custom colors.
  }
  cache.set(userId, colors)
  return colors
}

function write(userId, colors) {
  cache.set(userId, colors)
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(colors))
  } catch {
    // Storage can be unavailable (private mode); the color still applies until reload.
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function findFolderColor(id) {
  return FOLDER_COLORS.find((color) => color.id === id) ?? DEFAULT_FOLDER_COLOR
}

export function useFolderColors() {
  const { user } = useSession()
  const userId = user?.id ?? null
  const colors = useSyncExternalStore(subscribe, () => read(userId), () => EMPTY)

  const { connections } = useConnections()

  // Colors saved before accounts were told apart were keyed by provider ("onedrive:ref"). Only the
  // provider's oldest account inherits them; any other account starts with the default color.
  const legacyKeyOf = useCallback(
    (connectionId, ref) => {
      const connection = connections.find((item) => item.connectionId === connectionId)
      if (!connection) return null
      const oldest = oldestConnectionOf(connection.provider, connections)
      return oldest?.connectionId === connectionId ? entryKey(connection.provider, ref) : null
    },
    [connections],
  )

  const colorOf = useCallback(
    (connectionId, ref) => {
      const legacyKey = legacyKeyOf(connectionId, ref)
      return findFolderColor(colors[entryKey(connectionId, ref)] ?? (legacyKey ? colors[legacyKey] : undefined))
    },
    [colors, legacyKeyOf],
  )

  // Writes always use the account key; going back to the default also clears the legacy entry so it
  // cannot show through again.
  const setColor = useCallback(
    (connectionId, ref, id) => {
      if (!userId) return
      const next = { ...read(userId) }
      const key = entryKey(connectionId, ref)
      if (id === DEFAULT_FOLDER_COLOR.id) {
        delete next[key]
        const legacyKey = legacyKeyOf(connectionId, ref)
        if (legacyKey) delete next[legacyKey]
      } else {
        next[key] = id
      }
      write(userId, next)
    },
    [userId, legacyKeyOf],
  )

  return { colorOf, setColor }
}
