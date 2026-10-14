// Invalidation scopes: which part of the app a hub event can have changed.
//   home                 shortcuts and recents
//   providers            the provider list (connections, errors)
//   folder:<id>:<ref>    the content of one folder (empty ref = the provider root)
//   folders:<id>         the content of any folder of one provider
//   file:<id>:<ref>      one file or folder entry
//   files:<id>           any file of one provider
export const HOME = 'home'
export const PROVIDERS = 'providers'

export const folderScope = (providerId, parentRef) => `folder:${providerId}:${parentRef ?? ''}`
export const foldersScope = (providerId) => `folders:${providerId}`
export const fileScope = (providerId, ref) => `file:${providerId}:${ref ?? ''}`
export const filesScope = (providerId) => `files:${providerId}`

// What a screen that lists `parentRef` of a provider listens to.
export const folderScopes = (providerId, parentRef) => [folderScope(providerId, parentRef), foldersScope(providerId)]
export const fileScopes = (providerId, ref) => [fileScope(providerId, ref), filesScope(providerId)]

// Everything that can change when an item is renamed or deleted (its folder is not always known).
export function itemWriteScopes(providerId, ref) {
  return [foldersScope(providerId), fileScope(providerId, ref), HOME]
}

const sameId = (a, b) => a != null && b != null && String(a).toLowerCase() === String(b).toLowerCase()

function operationScopes(payload, providerId) {
  const request = payload?.request ?? {}
  const item = payload?.item ?? null
  const scopes = []
  const kind = request.kind
  const changesItem = kind === 'UPDATE' || kind === 'DELETE'

  // A rename or delete does not name the folder; the item the server returns does (unless its parent is unknown).
  const itemFolder = item && item.parentKnown !== false && item.parentRef !== undefined ? [item.parentRef] : []
  const requestFolder = request.parentRef !== undefined && request.parentRef !== null ? [request.parentRef] : []

  if (changesItem) {
    // A move names only the destination; the origin folder is unknown, so refresh all folders.
    const folders = requestFolder.length === 0 ? itemFolder : null
    if (folders && folders.length > 0) scopes.push(...folders.map((ref) => folderScope(providerId, ref)))
    else scopes.push(foldersScope(providerId))
    if (request.ref) scopes.push(fileScope(providerId, request.ref))
    scopes.push(HOME)
    return scopes
  }

  const folders = [...(kind === 'CREATE_FOLDER' || kind === 'UPLOAD' ? [request.parentRef ?? null] : []), ...itemFolder]
  const unique = [...new Set(folders.map((ref) => ref ?? ''))]
  if (unique.length > 0) scopes.push(...unique.map((ref) => folderScope(providerId, ref)))
  else scopes.push(foldersScope(providerId))
  return scopes
}

function catalogScopes(payload, providerId) {
  if (payload?.refresh) return [foldersScope(providerId), filesScope(providerId), HOME]
  if (payload && 'parentRef' in payload) return [folderScope(providerId, payload.parentRef)]
  // A removed item: its folder is not known.
  if (payload?.ref) return [foldersScope(providerId), fileScope(providerId, payload.ref)]
  return [foldersScope(providerId)]
}

// Maps the events of one poll to the scopes to refetch. `providers` is the provider list
// (each with `id` and `connectionId`); an event of a connection not in it reloads the list.
export function scopesForEvents(events, providers = []) {
  const scopes = new Set()

  for (const event of events ?? []) {
    const payload = event?.payload

    if (event?.type === 'hub_entries') {
      scopes.add(HOME)
      continue
    }

    if (event?.type !== 'operation' && event?.type !== 'catalog') continue

    const connectionId = event.connectionId ?? payload?.request?.connectionId
    const provider = providers.find((entry) => sameId(entry.connectionId, connectionId))
    if (!provider) {
      scopes.add(PROVIDERS)
      continue
    }

    const mapped = event.type === 'operation' ? operationScopes(payload, provider.id) : catalogScopes(payload, provider.id)
    mapped.forEach((scope) => scopes.add(scope))
  }

  return [...scopes]
}
