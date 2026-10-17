import { useCallback, useSyncExternalStore } from 'react'
import { useSession } from '../../shared/auth/SessionContext.jsx'

// Muted, neutral tones; the first one is the default carbon folder.
export const FOLDER_COLORS = [
  { id: 'carbon', label: 'Carvão', hex: '#4a4a4a' },
  { id: 'graphite', label: 'Grafite', hex: '#6e6e6e' },
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

function entryKey(provider, ref) {
  return `${provider}:${ref}`
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

  const colorOf = useCallback(
    (provider, ref) => findFolderColor(colors[entryKey(provider, ref)]),
    [colors],
  )

  const setColor = useCallback(
    (provider, ref, id) => {
      if (!userId) return
      const next = { ...read(userId) }
      if (id === DEFAULT_FOLDER_COLOR.id) delete next[entryKey(provider, ref)]
      else next[entryKey(provider, ref)] = id
      write(userId, next)
    },
    [userId],
  )

  return { colorOf, setColor }
}
