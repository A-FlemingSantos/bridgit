import { apiRequest } from './apiClient.js'
import { mutationHeaders } from './idempotency.js'
import { exceedsUploadLimit, uploadTooLargeError } from './limits.js'

function providerBase(provider) {
  return `/api/providers/${encodeURIComponent(provider)}`
}

function itemPath(provider, ref) {
  return `${providerBase(provider)}/items/${encodeURIComponent(ref)}`
}

export function listProviders(token) {
  return apiRequest('/api/providers', { token })
}

export function connectProvider(token, provider, redirectTo, { allowAccountChange = false } = {}) {
  const options = { method: 'POST', token }
  const body = {}
  if (redirectTo) body.redirectTo = redirectTo
  // Only sent after the user confirmed replacing the connected account.
  if (allowAccountChange) body.allowAccountChange = true
  if (Object.keys(body).length > 0) options.body = body
  return apiRequest(`${providerBase(provider)}/connect`, options)
}

export function disconnectProvider(token, provider) {
  return apiRequest(providerBase(provider), {
    method: 'DELETE',
    token,
  })
}

export function listFolder(token, provider, parentRef, cursor) {
  const query = {}

  if (parentRef != null && parentRef !== '') {
    query.parent = parentRef
  }

  if (cursor) {
    query.cursor = cursor
  }

  return apiRequest(`${providerBase(provider)}/items`, { token, query })
}

export function getItem(token, provider, ref) {
  return apiRequest(itemPath(provider, ref), { token })
}

export function createFolder(token, provider, parentRef, name, options = {}) {
  return apiRequest(`${providerBase(provider)}/folders`, {
    method: 'POST',
    token,
    // JSON bodies send the root as null; the API treats null and '' alike here.
    body: { parentRef: parentRef || null, name },
    headers: mutationHeaders(options),
  })
}

export async function uploadFile(token, provider, parentRef, file, options = {}) {
  if (exceedsUploadLimit(file)) throw uploadTooLargeError()

  const body = new FormData()
  // Multipart sends the root by leaving the field out.
  if (parentRef) body.append('parentRef', parentRef)
  body.append('file', file)

  return apiRequest(`${providerBase(provider)}/files`, {
    method: 'POST',
    token,
    body,
    headers: mutationHeaders(options),
  })
}

export function updateItem(token, provider, ref, { name, parentRef } = {}, options = {}) {
  const body = {}

  if (name !== undefined) {
    body.name = name
  }

  if (parentRef !== undefined) {
    // Unlike the other routes, null/omitted here means "do not move"; the root is the empty string.
    body.parentRef = parentRef === null || parentRef === '' ? '' : parentRef
  }

  return apiRequest(itemPath(provider, ref), {
    method: 'PATCH',
    token,
    body,
    headers: mutationHeaders(options),
  })
}

export function deleteItem(token, provider, ref, options = {}) {
  return apiRequest(itemPath(provider, ref), {
    method: 'DELETE',
    token,
    headers: mutationHeaders(options),
  })
}

export function getReadSource(token, provider, ref, refresh = false) {
  return apiRequest(`${itemPath(provider, ref)}/read`, { token, query: refresh ? { refresh: true } : undefined })
}

export function getThumbnail(token, provider, ref) {
  return apiRequest(`${itemPath(provider, ref)}/thumbnail`, { token, responseType: 'blob' })
}

export function createContentTicket(token, provider, ref, disposition) {
  return apiRequest(`${itemPath(provider, ref)}/ticket`, {
    method: 'POST',
    token,
    body: { disposition },
  })
}

export function search(token, query) {
  return apiRequest('/api/search', {
    token,
    query: { q: query },
  })
}

export function listRecents(token) {
  return apiRequest('/api/hub/recents', { token })
}

export function recordRecent(token, provider, ref) {
  return apiRequest('/api/hub/recents', {
    method: 'POST',
    token,
    body: { provider, ref },
  })
}

export function listShortcuts(token) {
  return apiRequest('/api/hub/shortcuts', { token })
}

export function addShortcut(token, provider, ref) {
  return apiRequest(`/api/hub/shortcuts/${encodeURIComponent(provider)}/${encodeURIComponent(ref)}`, {
    method: 'PUT',
    token,
  })
}

export function removeShortcut(token, provider, ref) {
  return apiRequest(`/api/hub/shortcuts/${encodeURIComponent(provider)}/${encodeURIComponent(ref)}`, {
    method: 'DELETE',
    token,
  })
}

export function listPublicLinks(token) {
  return apiRequest('/api/hub/public-links', { token })
}

export function getPublicLink(token, provider, ref) {
  return apiRequest(`${itemPath(provider, ref)}/public-link`, { token })
}

export function enablePublicLink(token, provider, ref) {
  return apiRequest(`${itemPath(provider, ref)}/public-link`, {
    method: 'PUT',
    token,
  })
}

export function disablePublicLink(token, provider, ref) {
  return apiRequest(`${itemPath(provider, ref)}/public-link`, {
    method: 'DELETE',
    token,
  })
}
