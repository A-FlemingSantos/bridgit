import { isApiClientError, isHubSessionFailure } from './hubCache.js'
import {
  ApiClientError,
  exceedsUploadLimit,
  uploadTooLargeError,
  submitOperation,
  submitUploadOperation,
  getOperation,
  listOperations,
  retryOperation,
  addShortcut as addShortcutRequest,
  connectProvider as connectProviderRequest,
  createContentTicket as createContentTicketRequest,
  createFolder as createFolderRequest,
  deleteItem as deleteItemRequest,
  disablePublicLink as disablePublicLinkRequest,
  disconnectConnection as disconnectConnectionRequest,
  disconnectProvider as disconnectProviderRequest,
  enablePublicLink as enablePublicLinkRequest,
  getConnectionAvatar as getConnectionAvatarRequest,
  getItem as getItemRequest,
  getPublicLink as getPublicLinkRequest,
  getReadSource as getReadSourceRequest,
  getThumbnail as getThumbnailRequest,
  listFolder as listFolderRequest,
  listProviders as listProvidersRequest,
  listPublicLinks as listPublicLinksRequest,
  listRecents as listRecentsRequest,
  listShortcuts as listShortcutsRequest,
  recordRecent as recordRecentRequest,
  removeShortcut as removeShortcutRequest,
  search as searchRequest,
  updateItem as updateItemRequest,
  uploadFile as uploadFileRequest,
} from '@bridgit/shared-client'

import { resolveContentUrls } from '../config/apiBase.js'

export { isApiClientError, isHubSessionFailure }

// A picked file can stop being readable before it is sent: a shortcut whose target is gone, or a file moved
// or deleted after it was chosen. The browser then drops the request mid-body, which reads as a lost upload
// and gets retried; reading one byte first turns it into a definite refusal that names the file.
// A missing target is picked with size 0, and an empty slice never touches the disk, so an empty file is
// read whole instead (zero bytes, still opened).
async function assertReadable(file) {
  if (!(file instanceof Blob)) return
  try {
    await (file.size === 0 ? file : file.slice(0, 1)).arrayBuffer()
  } catch {
    throw new ApiClientError(`Não foi possível ler ${file.name || 'o arquivo'}.`, { code: 'ARQUIVO_ILEGIVEL', status: 400 })
  }
}

export function createHubApi(getToken, onUnauthorized, options = {}) {
  const uncertainRequests = new Map()
  const uncertainLegacyRequests = new Map()
  const fileIdentities = new WeakMap()
  async function call(request) {
    const token = getToken()
    const identity = options.getIdentity?.()
    if (!token) {
      throw new Error('Sessão indisponível.')
    }

    try {
      const result = await request(token)
      if (identity !== options.getIdentity?.()) throw new ApiClientError('A sessão foi alterada.', { status: 409, code: 'RESPOSTA_OBSOLETA' })
      return result
    } catch (error) {
      if (isHubSessionFailure(error)) {
        onUnauthorized(error)
      }
      throw error
    }
  }

  // hooks.onAccepted runs once the server has queued the work, before it is done: a form can close there,
  // since the change already shows as pending and a later rejection is reported on its own.
  async function operation(connectionId, kind, fields, file, hooks = {}) {
    const connection = options.getConnection?.(connectionId)
    if (!connection?.connectionId || connection.operationsEnabled === false) return null
    const identity = options.getIdentity?.()
    if (file && !fileIdentities.has(file)) fileIdentities.set(file, crypto.randomUUID())
    const signature = JSON.stringify([identity, connection.connectionId, connection.generation, kind, fields, file ? fileIdentities.get(file) : null])
    const recovered = options.getUncertainOperation?.(connectionId, kind, fields)
    const previous = uncertainRequests.get(signature) ?? (recovered ? { request: recovered.request, accepted: recovered } : null)
    const request = previous?.request ?? {
      clientKey: hooks.clientKey ?? crypto.randomUUID(), provider: connection.provider, kind,
      connectionId: connection.connectionId, generation: connection.generation,
      ...(fields.ref ? { expectedVersion: options.getItemVersion?.(connectionId, fields.ref) ?? null } : {}), ...fields,
    }
    options.onIntent?.(request, file)
    uncertainRequests.set(signature, { request, accepted: previous?.accepted })
    let accepted = previous?.accepted
    if (accepted?.status === 'NEEDS_ATTENTION' || accepted?.status === 'WAITING_RECONNECT') accepted = await call((token) => retryOperation(token, accepted.id))
    for (let attempt = 0; !accepted; attempt += 1) {
      try { accepted = await call((token) => file ? submitUploadOperation(token, request, file) : submitOperation(token, request)) }
      catch (error) {
        if (error.status >= 400 && error.status < 500) {
          uncertainRequests.delete(signature)
          options.onOperation?.({ id: `client:${request.clientKey}`, request, status: 'REJECTED', errorCode: error.code, errorMessage: error.message, updatedAt: new Date().toISOString() })
          throw error
        }
        if (attempt >= 2 || identity !== options.getIdentity?.()) {
          options.onOperation?.({ id: `client:${request.clientKey}`, request, status: 'NEEDS_ATTENTION', errorCode: error.code, errorMessage: error.message, updatedAt: new Date().toISOString() })
          throw error
        }
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt))
      }
    }
    uncertainRequests.set(signature, { request, accepted })
    options.onOperation?.(accepted)
    // Work refused at submit throws below; the form must stay open to show that error.
    if (!['REJECTED', 'NEEDS_ATTENTION', 'WAITING_RECONNECT'].includes(accepted.status)) hooks.onAccepted?.()
    while (!['SUCCEEDED', 'REJECTED', 'NEEDS_ATTENTION', 'WAITING_RECONNECT'].includes(accepted.status)) {
      await new Promise((resolve) => setTimeout(resolve, 750))
      if (identity !== options.getIdentity?.()) throw new ApiClientError('A sessão foi alterada.', { status: 409, code: 'RESPOSTA_OBSOLETA' })
      try {
        accepted = await call((token) => getOperation(token, accepted.id))
        uncertainRequests.set(signature, { request, accepted })
        options.onOperation?.(accepted)
      } catch (error) {
        if (error.status !== 0 && error.status < 500) throw error
        // The server owns accepted work. A transient polling failure cannot turn it into a new write.
      }
    }
    if (accepted.status === 'REJECTED') uncertainRequests.delete(signature)
    if (accepted.status !== 'SUCCEEDED') throw new ApiClientError(accepted.errorMessage ?? 'Não foi possível concluir a operação.', {
      status: accepted.status === 'NEEDS_ATTENTION' ? 503 : 409, code: accepted.errorCode ?? 'OPERACAO_REJEITADA',
    })
    uncertainRequests.delete(signature)
    // The operation answers without the account; the caller expects items self-describing, like the other routes.
    return kind === 'DELETE' ? { deleted: true } : accepted.item && { ...accepted.item, connectionId: connection.connectionId }
  }

  async function legacy(connectionId, kind, fields, file, request) {
    const identity = options.getIdentity?.() ?? getToken()
    const connection = options.getConnection?.(connectionId)
    if (file && !fileIdentities.has(file)) fileIdentities.set(file, crypto.randomUUID())
    const signature = JSON.stringify([identity, connectionId, connection?.generation,
      kind, fields, file ? fileIdentities.get(file) : null])
    const clientKey = uncertainLegacyRequests.get(signature) ?? crypto.randomUUID()
    uncertainLegacyRequests.set(signature, clientKey)
    try {
      const result = await call((token) => request(token, { clientKey }))
      uncertainLegacyRequests.delete(signature)
      return result
    } catch (error) {
      // A lost response or accepted-but-pending 503 must keep the original action identity.
      if (error.status >= 400 && error.status < 500) uncertainLegacyRequests.delete(signature)
      throw error
    }
  }

  return {
    listProviders: () => call((token) => listProvidersRequest(token)),
    connectProvider: (provider, redirectTo, options) =>
      call((token) => connectProviderRequest(token, provider, redirectTo, options)),
    disconnectProvider: (provider) => call((token) => disconnectProviderRequest(token, provider)),
    disconnectConnection: (connectionId) => call((token) => disconnectConnectionRequest(token, connectionId)),
    getConnectionAvatar: (connectionId, generation) =>
      call((token) => getConnectionAvatarRequest(token, connectionId, generation)),
    listFolder: (connectionId, parentRef, cursor) =>
      call((token) => listFolderRequest(token, connectionId, parentRef, cursor)),
    getItem: (connectionId, ref) => call((token) => getItemRequest(token, connectionId, ref)),
    createFolder: async (connectionId, parentRef, name, hooks) =>
      await operation(connectionId, 'CREATE_FOLDER', { parentRef, name }, null, hooks) ?? legacy(connectionId, 'CREATE_FOLDER', { parentRef, name }, null,
        (token, requestOptions) => createFolderRequest(token, connectionId, parentRef, name, requestOptions)),
    uploadFile: async (connectionId, parentRef, file) => {
      if (exceedsUploadLimit(file)) throw uploadTooLargeError()
      await assertReadable(file)
      return await operation(connectionId, 'UPLOAD', { parentRef, name: file.name, contentType: file.type }, file) ?? legacy(connectionId, 'UPLOAD',
        { parentRef, name: file.name, contentType: file.type }, file,
        (token, requestOptions) => uploadFileRequest(token, connectionId, parentRef, file, requestOptions))
    },
    updateItem: async (connectionId, ref, patch) => await operation(connectionId, 'UPDATE', { ref, ...patch,
      ...(patch.parentRef !== undefined ? { parentRef: patch.parentRef || '' } : {}),
    }) ?? legacy(connectionId, 'UPDATE', { ref, ...patch }, null,
      (token, requestOptions) => updateItemRequest(token, connectionId, ref, patch, requestOptions)),
    deleteItem: async (connectionId, ref, hooks) => await operation(connectionId, 'DELETE', { ref }, null, hooks) ?? legacy(connectionId, 'DELETE', { ref }, null,
      (token, requestOptions) => deleteItemRequest(token, connectionId, ref, requestOptions)),
    getReadSource: async (connectionId, ref, refresh = false) =>
      resolveContentUrls(await call((token) => getReadSourceRequest(token, connectionId, ref, refresh))),
    getThumbnail: (connectionId, ref) => call((token) => getThumbnailRequest(token, connectionId, ref)),
    listOperations: () => call(listOperations),
    retryOperation: (id) => call((token) => retryOperation(token, id)),
    createContentTicket: async (connectionId, ref, disposition) =>
      resolveContentUrls(await call((token) => createContentTicketRequest(token, connectionId, ref, disposition))),
    search: (query) => call((token) => searchRequest(token, query)),
    listRecents: () => call((token) => listRecentsRequest(token)),
    recordRecent: (connectionId, ref) => call((token) => recordRecentRequest(token, connectionId, ref)),
    listShortcuts: () => call((token) => listShortcutsRequest(token)),
    addShortcut: (connectionId, ref) => call((token) => addShortcutRequest(token, connectionId, ref)),
    removeShortcut: (connectionId, ref) => call((token) => removeShortcutRequest(token, connectionId, ref)),
    listPublicLinks: () => call((token) => listPublicLinksRequest(token)),
    getPublicLink: (connectionId, ref) => call((token) => getPublicLinkRequest(token, connectionId, ref)),
    enablePublicLink: (connectionId, ref) => call((token) => enablePublicLinkRequest(token, connectionId, ref)),
    disablePublicLink: (connectionId, ref) => call((token) => disablePublicLinkRequest(token, connectionId, ref)),
  }
}
