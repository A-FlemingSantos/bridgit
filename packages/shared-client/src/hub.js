import { apiRequest } from './apiClient.js'
import { mutationHeaders } from './idempotency.js'
import { MAX_EDITABLE_TEXT_BYTES, editableTextTooLargeError, exceedsUploadLimit, uploadTooLargeError } from './limits.js'

function providerBase(provider) {
  return `/api/providers/${encodeURIComponent(provider)}`
}

function connectionBase(connectionId) {
  return `/api/connections/${encodeURIComponent(connectionId)}`
}

function itemPath(connectionId, ref) {
  return `${connectionBase(connectionId)}/items/${encodeURIComponent(ref)}`
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// Connection routes do not echo the connectionId, so the client stamps it to keep items self-describing.
function stampItem(item, connectionId) {
  return isObject(item) ? { ...item, connectionId } : item
}

function stampAncestry(node, connectionId) {
  if (!isObject(node)) return node
  const stamped = { ...node, connectionId }
  if (Array.isArray(node.ancestry)) {
    stamped.ancestry = node.ancestry.map((entry) => stampItem(entry, connectionId))
  }
  return stamped
}

export function listProviders(token) {
  return apiRequest('/api/providers', { token })
}

export function connectProvider(token, provider, redirectTo, { addAccount = false } = {}) {
  const options = { method: 'POST', token }
  const body = {}
  if (redirectTo) body.redirectTo = redirectTo
  // Connects an additional account instead of reconnecting an existing one.
  if (addAccount) body.addAccount = true
  if (Object.keys(body).length > 0) options.body = body
  return apiRequest(`${providerBase(provider)}/connect`, options)
}

// Disconnects every account of the provider.
export function disconnectProvider(token, provider) {
  return apiRequest(providerBase(provider), {
    method: 'DELETE',
    token,
  })
}

export function disconnectConnection(token, connectionId) {
  return apiRequest(connectionBase(connectionId), {
    method: 'DELETE',
    token,
  })
}

// Avatar bytes change with the connection generation; the query keeps caches from serving a stale image.
export function connectionAvatarPath(connectionId, generation) {
  const path = `${connectionBase(connectionId)}/avatar`
  return generation == null ? path : `${path}?v=${encodeURIComponent(generation)}`
}

export function getConnectionAvatar(token, connectionId, generation) {
  return apiRequest(`${connectionBase(connectionId)}/avatar`, {
    token,
    query: generation == null ? undefined : { v: generation },
    responseType: 'blob',
  })
}

export async function listFolder(token, connectionId, parentRef, cursor) {
  const query = {}

  if (parentRef != null && parentRef !== '') {
    query.parent = parentRef
  }

  if (cursor) {
    query.cursor = cursor
  }

  const response = await apiRequest(`${connectionBase(connectionId)}/items`, { token, query })
  if (!isObject(response)) return response
  const stamped = { ...response }
  if (Array.isArray(response.items)) stamped.items = response.items.map((item) => stampItem(item, connectionId))
  if (isObject(response.folder)) stamped.folder = stampAncestry(response.folder, connectionId)
  return stamped
}

export async function getItem(token, connectionId, ref) {
  return stampAncestry(await apiRequest(itemPath(connectionId, ref), { token }), connectionId)
}

export async function createFolder(token, connectionId, parentRef, name, options = {}) {
  const item = await apiRequest(`${connectionBase(connectionId)}/folders`, {
    method: 'POST',
    token,
    // JSON bodies send the root as null; the API treats null and '' alike here.
    body: { parentRef: parentRef || null, name },
    headers: mutationHeaders(options),
  })
  return stampItem(item, connectionId)
}

export async function uploadFile(token, connectionId, parentRef, file, options = {}) {
  if (exceedsUploadLimit(file)) throw uploadTooLargeError()

  const body = new FormData()
  // Multipart sends the root by leaving the field out.
  if (parentRef) body.append('parentRef', parentRef)
  body.append('file', file)

  const item = await apiRequest(`${connectionBase(connectionId)}/files`, {
    method: 'POST',
    token,
    body,
    headers: mutationHeaders(options),
  })
  return stampItem(item, connectionId)
}

// Replaces the content of an existing file with the edited text; expectedVersion is the content revision it was opened at.
export async function replaceFileContent(token, connectionId, ref, file, expectedVersion, options = {}) {
  if (typeof file?.size === 'number' && file.size > MAX_EDITABLE_TEXT_BYTES) throw editableTextTooLargeError()

  const body = new FormData()
  body.append('file', file)
  body.append('expectedVersion', expectedVersion)

  const item = await apiRequest(`${itemPath(connectionId, ref)}/content`, {
    method: 'POST',
    token,
    body,
    headers: mutationHeaders(options),
  })
  return stampItem(item, connectionId)
}

export async function updateItem(token, connectionId, ref, { name, parentRef } = {}, options = {}) {
  const body = {}

  if (name !== undefined) {
    body.name = name
  }

  if (parentRef !== undefined) {
    // Unlike the other routes, null/omitted here means "do not move"; the root is the empty string.
    body.parentRef = parentRef === null || parentRef === '' ? '' : parentRef
  }

  const item = await apiRequest(itemPath(connectionId, ref), {
    method: 'PATCH',
    token,
    body,
    headers: mutationHeaders(options),
  })
  return stampItem(item, connectionId)
}

export function deleteItem(token, connectionId, ref, options = {}) {
  return apiRequest(itemPath(connectionId, ref), {
    method: 'DELETE',
    token,
    headers: mutationHeaders(options),
  })
}

export function getReadSource(token, connectionId, ref, refresh = false) {
  return apiRequest(`${itemPath(connectionId, ref)}/read`, { token, query: refresh ? { refresh: true } : undefined })
}

// For clients that download the preview themselves (mobile writes it to a file with the token header).
export function itemThumbnailPath(connectionId, ref) {
  return `${itemPath(connectionId, ref)}/thumbnail`
}

export function getThumbnail(token, connectionId, ref) {
  return apiRequest(itemThumbnailPath(connectionId, ref), { token, responseType: 'blob' })
}

export function createContentTicket(token, connectionId, ref, disposition) {
  return apiRequest(`${itemPath(connectionId, ref)}/ticket`, {
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

export function recordRecent(token, connectionId, ref) {
  return apiRequest('/api/hub/recents', {
    method: 'POST',
    token,
    body: { connectionId, ref },
  })
}

export function listShortcuts(token) {
  return apiRequest('/api/hub/shortcuts', { token })
}

export function addShortcut(token, connectionId, ref) {
  return apiRequest(`${itemPath(connectionId, ref)}/shortcut`, {
    method: 'PUT',
    token,
  })
}

export function removeShortcut(token, connectionId, ref) {
  return apiRequest(`${itemPath(connectionId, ref)}/shortcut`, {
    method: 'DELETE',
    token,
  })
}

export function listPublicLinks(token) {
  return apiRequest('/api/hub/public-links', { token })
}

export function getPublicLink(token, connectionId, ref) {
  return apiRequest(`${itemPath(connectionId, ref)}/public-link`, { token })
}

export function enablePublicLink(token, connectionId, ref) {
  return apiRequest(`${itemPath(connectionId, ref)}/public-link`, {
    method: 'PUT',
    token,
  })
}

export function disablePublicLink(token, connectionId, ref) {
  return apiRequest(`${itemPath(connectionId, ref)}/public-link`, {
    method: 'DELETE',
    token,
  })
}
