import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { Platform } from 'react-native'
import * as FileSystem from 'expo-file-system'
import { useSession } from '../auth/SessionContext'
import { oldestConnectionOf, findConnection } from './connections'
import { colorIdOf, migrateLegacyColors, withColor } from './folderColorKeys'
import { useHub } from './HubContext'

// Same muted tones as the web app; the first one is the default carbon folder.
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

const EMPTY = Object.freeze({})
const cache = new Map()
const loading = new Set()
const listeners = new Set()

function storageKey(userId) {
  return `bridgit.folderColors.${userId}`
}

function fileFor(userId) {
  return `${FileSystem.documentDirectory}folder-colors-${encodeURIComponent(userId)}.json`
}

function notify() {
  listeners.forEach((listener) => listener())
}

// Colors live on this device only, per user, like the web keeps them per browser.
async function load(userId) {
  let colors = EMPTY
  try {
    const raw = Platform.OS === 'web'
      ? globalThis.localStorage?.getItem(storageKey(userId))
      : await FileSystem.readAsStringAsync(fileFor(userId))
    const parsed = JSON.parse(raw ?? 'null')
    if (parsed && typeof parsed === 'object') colors = parsed
  } catch {
    // No file yet, or unreadable: no custom colors.
  }
  if (!cache.has(userId)) {
    cache.set(userId, colors)
    notify()
  }
}

function read(userId) {
  if (!userId) return EMPTY
  if (cache.has(userId)) return cache.get(userId)
  if (!loading.has(userId)) {
    loading.add(userId)
    load(userId)
  }
  return EMPTY
}

function write(userId, colors) {
  cache.set(userId, colors)
  notify()
  const raw = JSON.stringify(colors)
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(storageKey(userId), raw)
    } catch {
      // Storage can be unavailable; the color still applies until reload.
    }
    return
  }
  FileSystem.writeAsStringAsync(fileFor(userId), raw).catch(() => {})
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
  const { connections } = useHub()
  const userId = user?.id ?? user?.username ?? null
  const colors = useSyncExternalStore(subscribe, () => read(userId), () => EMPTY)

  // Colors saved per provider (before accounts could be added) belong to the provider's oldest connection.
  const legacyProviderOf = useCallback((connectionId) => {
    const connection = findConnection(connections, connectionId)
    if (!connection) return null
    return oldestConnectionOf(connections, connection.providerId)?.connectionId === connection.connectionId
      ? connection.providerId
      : null
  }, [connections])

  const colorOf = useCallback(
    (connectionId, ref) => findFolderColor(colorIdOf(colors, connectionId, ref, legacyProviderOf(connectionId))),
    [colors, legacyProviderOf],
  )

  const setColor = useCallback((connectionId, ref, id) => {
    if (!userId) return
    write(userId, withColor(read(userId), connectionId, ref, id, DEFAULT_FOLDER_COLOR.id, legacyProviderOf(connectionId)))
  }, [userId, legacyProviderOf])

  // Once colors and connections are both known, legacy keys move to their connection for good.
  useEffect(() => {
    if (!userId || !cache.has(userId) || connections.length === 0) return
    const migrated = migrateLegacyColors(colors, (providerId) =>
      oldestConnectionOf(connections, providerId)?.connectionId ?? null)
    if (migrated) write(userId, migrated)
  }, [userId, colors, connections])

  return { colorOf, setColor }
}
