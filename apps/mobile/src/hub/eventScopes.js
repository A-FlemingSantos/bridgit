// Invalidation scopes: which part of the app a hub event can have changed.
//   home                 shortcuts and recents
//   providers                  the provider list (connections, errors)
//   folder:<conn>:<ref>        the content of one folder of one connection (empty ref = its root)
//   folders:<conn>             the content of any folder of one connection
//   file:<conn>:<ref>          one file or folder entry of one connection
//   files:<conn>               any file of one connection
// <conn> is the connectionId (a UUID, compared in lower case): each connected account is its own scope.
export const HOME = 'home'
export const PROVIDERS = 'providers'

const idOf = (connectionId) => String(connectionId ?? '').toLowerCase()

export const folderScope = (connectionId, parentRef) => `folder:${idOf(connectionId)}:${parentRef ?? ''}`
export const foldersScope = (connectionId) => `folders:${idOf(connectionId)}`
export const fileScope = (connectionId, ref) => `file:${idOf(connectionId)}:${ref ?? ''}`
export const filesScope = (connectionId) => `files:${idOf(connectionId)}`

// What a screen that lists `parentRef` of a connection listens to.
export const folderScopes = (connectionId, parentRef) => [folderScope(connectionId, parentRef), foldersScope(connectionId)]
export const fileScopes = (connectionId, ref) => [fileScope(connectionId, ref), filesScope(connectionId)]

// Everything that can change when an item is renamed or deleted (its folder is not always known).
export function itemWriteScopes(connectionId, ref) {
  return [foldersScope(connectionId), fileScope(connectionId, ref), HOME]
}

const sameId = (a, b) => a != null && b != null && String(a).toLowerCase() === String(b).toLowerCase()

function operationScopes(payload, connectionId) {
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
    if (folders && folders.length > 0) scopes.push(...folders.map((ref) => folderScope(connectionId, ref)))
    else scopes.push(foldersScope(connectionId))
    if (request.ref) scopes.push(fileScope(connectionId, request.ref))
    scopes.push(HOME)
    return scopes
  }

  const folders = [...(kind === 'CREATE_FOLDER' || kind === 'UPLOAD' ? [request.parentRef ?? null] : []), ...itemFolder]
  const unique = [...new Set(folders.map((ref) => ref ?? ''))]
  if (unique.length > 0) scopes.push(...unique.map((ref) => folderScope(connectionId, ref)))
  else scopes.push(foldersScope(connectionId))
  return scopes
}

function catalogScopes(payload, connectionId) {
  if (payload?.refresh) return [foldersScope(connectionId), filesScope(connectionId), HOME]
  if (payload && 'parentRef' in payload) return [folderScope(connectionId, payload.parentRef)]
  // A removed item: its folder is not known.
  if (payload?.ref) return [foldersScope(connectionId), fileScope(connectionId, payload.ref)]
  return [foldersScope(connectionId)]
}

// Maps the events of one poll to the scopes to refetch. `connections` is the flattened connection list
// (each with a `connectionId`); an event of a connection not in it reloads the provider list.
export function scopesForEvents(events, connections = []) {
  const scopes = new Set()

  for (const event of events ?? []) {
    const payload = event?.payload

    if (event?.type === 'hub_entries') {
      scopes.add(HOME)
      continue
    }

    if (event?.type !== 'operation' && event?.type !== 'catalog') continue

    const connectionId = event.connectionId ?? payload?.request?.connectionId
    const known = connections.find((entry) => sameId(entry.connectionId, connectionId))
    if (!known) {
      scopes.add(PROVIDERS)
      continue
    }

    const mapped = event.type === 'operation' ? operationScopes(payload, known.connectionId) : catalogScopes(payload, known.connectionId)
    mapped.forEach((scope) => scopes.add(scope))
  }

  return [...scopes]
}
