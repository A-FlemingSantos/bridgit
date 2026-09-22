import { apiRequest } from '@bridgit/shared-client'
import { buildStoredSession, getDeviceKey, setBrowserCookie, writeSession } from './sessionStorage.js'

export async function loginRequest({ username, password, persistent }) {
  const data = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: {
      username,
      password,
      deviceKey: getDeviceKey(),
      persistent,
    },
  })

  const session = buildStoredSession(data)
  writeSession(session)
  if (!persistent) {
    setBrowserCookie()
  }
  return session
}

export async function registerRequest({ username, password }) {
  const data = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: {
      username,
      password,
      deviceKey: getDeviceKey(),
      persistent: false,
    },
  })

  const session = buildStoredSession(data)
  writeSession(session)
  setBrowserCookie()
  return session
}

export async function refreshRequest(token) {
  const data = await apiRequest('/api/auth/refresh', {
    method: 'POST',
    token,
  })
  const session = buildStoredSession(data)
  writeSession(session)
  return session
}

export async function logoutRequest(token) {
  return apiRequest('/api/auth/logout', {
    method: 'POST',
    token,
  })
}

export async function updateSessionPersistentRequest(token, persistent) {
  const data = await apiRequest('/api/auth/session', {
    method: 'PATCH',
    token,
    body: { persistent },
  })
  return data
}

export async function updateAccountRequest(token, username) {
  const data = await apiRequest('/api/account', {
    method: 'PATCH',
    token,
    body: { username },
  })
  const session = buildStoredSession(data)
  writeSession(session)
  return session
}

export async function changePasswordRequest(token, currentPassword, newPassword) {
  return apiRequest('/api/account/password', {
    method: 'POST',
    token,
    body: { currentPassword, newPassword },
  })
}

export async function deleteAccountRequest(token) {
  return apiRequest('/api/account', {
    method: 'DELETE',
    token,
  })
}

export async function revokeOtherSessionsRequest(token) {
  return apiRequest('/api/auth/sessions/revoke-others', {
    method: 'POST',
    token,
  })
}
