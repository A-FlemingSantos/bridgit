import { folderCacheKey, itemCacheKey } from './hubCache.js'

const pending = new Set(['SUBMITTING', 'QUEUED', 'EXECUTING', 'VERIFYING', 'WAITING_RECONNECT', 'NEEDS_ATTENTION'])

/** Project durable intent over confirmed snapshots. Neither input is mutated. */
export function projectOperations(folderCache, itemCache, operations, providers) {
  let folders = folderCache
  let items = itemCache
  const activeConnections = new Map(providers.map((provider) => [provider.connectionId, provider]))
  const completed = new Map()
  for (const op of Object.values(operations)) if (op.status === 'SUCCEEDED' && op.request?.ref && op.sequence) {
    const key = `${op.request.connectionId}:${op.request.generation}:${op.request.ref}`
    completed.set(key, Math.max(completed.get(key) ?? 0, op.sequence))
  }
  for (const op of Object.values(operations)) {
    if (!pending.has(op.status)) continue
    const request = op.request
    if (op.sequence && op.sequence < (completed.get(`${request?.connectionId}:${request?.generation}:${request?.ref}`) ?? 0)) continue
    const connection = activeConnections.get(request?.connectionId)
    if (!connection || String(connection.generation) !== String(request.generation)) continue
    const provider = request.provider
    const creation = request.kind === 'CREATE_FOLDER' || request.kind === 'UPLOAD'
    const attention = op.status === 'NEEDS_ATTENTION' || op.status === 'WAITING_RECONNECT'
    const projected = (item) => {
      if (item.provider !== provider || item.ref !== request.ref) return item
      return { ...item, ...(request.name ? { name: request.name } : {}),
        ...(request.parentRef !== undefined && request.parentRef !== null ? { parentRef: request.parentRef || null } : {}),
        pending: true, unconfirmed: attention, _operationId: op.id }
    }
    if (folders === folderCache) folders = { ...folderCache }
    const moving = request.kind === 'UPDATE' && request.parentRef !== undefined && request.parentRef !== null
      ? items[itemCacheKey(provider, request.ref)]?.item ?? Object.values(folders).flatMap((entry) => entry.items ?? []).find((item) => item.provider === provider && item.ref === request.ref)
      : null
    for (const [key, entry] of Object.entries(folders)) {
      if (!entry?.items) continue
      let next = entry.items
      if (!creation) {
        next = next.flatMap((item) => {
          if (item.provider !== provider || item.ref !== request.ref) return [item]
          if (request.kind === 'DELETE') return []
          if (request.parentRef !== undefined && request.parentRef !== null && key !== folderCacheKey(provider, request.parentRef || null)) return []
          return [projected(item)]
        })
      }
      if (creation && key === folderCacheKey(provider, request.parentRef || null)) {
        const exists = next.some((item) => item._operationId === op.id || item.ref === `temp-operation-${request.clientKey ?? op.id}`)
        if (!exists) next = [...next, { ...op.localItem, ref: `temp-operation-${request.clientKey ?? op.id}`, uiKey: `operation-${request.clientKey ?? op.id}`, provider,
          name: request.name, parentRef: request.parentRef || null, parentKnown: true,
          kind: request.kind === 'CREATE_FOLDER' ? 'folder' : 'file', mimeType: request.contentType,
          pending: true, unconfirmed: attention, _operationId: op.id }]
      }
      if (moving && key === folderCacheKey(provider, request.parentRef || null) && !next.some((item) => item.provider === provider && item.ref === moving.ref)) next = [projected(moving), ...next]
      folders[key] = { ...entry, items: next }
    }
    if (!creation && request.ref) {
      const key = itemCacheKey(provider, request.ref)
      if (items[key]?.item && request.kind !== 'DELETE') {
        if (items === itemCache) items = { ...itemCache }
        items[key] = { ...items[key], item: projected(items[key].item) }
      }
    }
  }
  return { folderCache: folders, itemCache: items }
}
