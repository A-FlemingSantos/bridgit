import Constants from 'expo-constants'
import { configureApiClient } from '@bridgit/shared-client'

const API_PORT = 8080
const DEFAULT_API_BASE_URL = `http://localhost:${API_PORT}`

// In development Expo knows the address of the machine running Metro. A phone or emulator cannot reach
// that machine as "localhost", so the API is assumed to be on the same host unless a URL is configured.
function developmentHostUrl() {
  const host = Constants.expoConfig?.hostUri?.split(':')[0]
  return host ? `http://${host}:${API_PORT}` : null
}

export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL || developmentHostUrl() || DEFAULT_API_BASE_URL
).replace(/\/+$/, '')

export const apiOptions = { baseUrl: API_BASE_URL }

// The shared hub functions take no baseUrl, so every request picks it up from here.
configureApiClient(apiOptions)
