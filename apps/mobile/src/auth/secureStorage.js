import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

// expo-secure-store has no web implementation; Expo web (mobile:web) falls back to localStorage.
const useWebStorage = Platform.OS === 'web'

export async function getItem(key) {
  if (useWebStorage) return globalThis.localStorage?.getItem(key) ?? null
  return SecureStore.getItemAsync(key)
}

export async function setItem(key, value) {
  if (useWebStorage) {
    globalThis.localStorage?.setItem(key, value)
    return
  }
  await SecureStore.setItemAsync(key, value)
}

export async function removeItem(key) {
  if (useWebStorage) {
    globalThis.localStorage?.removeItem(key)
    return
  }
  await SecureStore.deleteItemAsync(key)
}
