import { ApiClientError, apiRequest } from './apiClient.js'

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

function providerBase(provider) {
  return `/api/providers/${encodeURIComponent(provider)}`
}

function itemPath(provider, ref) {
  return `${providerBase(provider)}/items/${encodeURIComponent(ref)}`
}

export function listProviders(token) {
  return apiRequest('/api/providers', { token })
}

export function connectProvider(token, provider, redirectTo) {
  const options = { method: 'POST', token }
  if (redirectTo) {
    options.body = { redirectTo }
  }
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

export function createFolder(token, provider, parentRef, name) {
  return apiRequest(`${providerBase(provider)}/folders`, {
    method: 'POST',
    token,
    body: { parentRef, name },
  })
}

export function uploadFile(token, provider, parentRef, file) {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ApiClientError('O arquivo excede o limite de 50 MB.', {
      code: 'ARQUIVO_GRANDE',
      status: 0,
    })
  }

  const body = new FormData()
  body.append('parentRef', parentRef ?? '')
  body.append('file', file)

  return apiRequest(`${providerBase(provider)}/files`, {
    method: 'POST',
    token,
    body,
  })
}

export function updateItem(token, provider, ref, { name, parentRef } = {}) {
  const body = {}

  if (name !== undefined) {
    body.name = name
  }

  if (parentRef !== undefined) {
    body.parentRef = parentRef === null || parentRef === '' ? '' : parentRef
  }

  return apiRequest(itemPath(provider, ref), {
    method: 'PATCH',
    token,
    body,
  })
}

export function deleteItem(token, provider, ref) {
  return apiRequest(itemPath(provider, ref), {
    method: 'DELETE',
    token,
  })
}

export function getReadSource(token, provider, ref) {
  return apiRequest(`${itemPath(provider, ref)}/read`, { token })
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
