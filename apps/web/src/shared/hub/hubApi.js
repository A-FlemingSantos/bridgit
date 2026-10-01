import { isApiClientError, isHubSessionFailure } from './hubCache.js'
import {
  ApiClientError,
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
  disconnectProvider as disconnectProviderRequest,
  enablePublicLink as enablePublicLinkRequest,
  getItem as getItemRequest,
  getPublicLink as getPublicLinkRequest,
  getReadSource as getReadSourceRequest,
  listFolder as listFolderRequest,
  listProviders as listProvidersRequest,
  listRecents as listRecentsRequest,
  listShortcuts as listShortcutsRequest,
  recordRecent as recordRecentRequest,
  removeShortcut as removeShortcutRequest,
  search as searchRequest,
  updateItem as updateItemRequest,
  uploadFile as uploadFileRequest,
} from '@bridgit/shared-client'

export { isApiClientError, isHubSessionFailure }

export function createHubApi(getToken, onUnauthorized, options = {}) {
  const uncertainRequests = new Map()
  const fileIdentities = new WeakMap()
  async function call(request) {
    const token = getToken()
    const identity = options.getIdentity?.()
    if (!token) {
      throw new Error('Sessao indisponivel.')
    }

    try {
      const result = await request(token)
      if (identity !== options.getIdentity?.()) throw new ApiClientError('A sessao foi alterada.', { status: 409, code: 'RESPOSTA_OBSOLETA' })
      return result
    } catch (error) {
      if (isHubSessionFailure(error)) {
        onUnauthorized(error)
      }
      throw error
    }
  }

  async function operation(provider, kind, fields, file) {
    const connection = options.getConnection?.(provider)
    if (!connection?.connectionId || connection.operationsEnabled === false) return null
    const identity = options.getIdentity?.()
    if (file && !fileIdentities.has(file)) fileIdentities.set(file, crypto.randomUUID())
    const signature = JSON.stringify([identity, connection.connectionId, connection.generation, kind, fields, file ? fileIdentities.get(file) : null])
    const recovered = options.getUncertainOperation?.(provider, kind, fields)
    const previous = uncertainRequests.get(signature) ?? (recovered ? { request: recovered.request, accepted: recovered } : null)
    const request = previous?.request ?? {
      clientKey: crypto.randomUUID(), provider, kind,
      connectionId: connection.connectionId, generation: connection.generation,
      ...(fields.ref ? { expectedVersion: options.getItemVersion?.(provider, fields.ref) ?? null } : {}), ...fields,
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
    while (!['SUCCEEDED', 'REJECTED', 'NEEDS_ATTENTION', 'WAITING_RECONNECT'].includes(accepted.status)) {
      await new Promise((resolve) => setTimeout(resolve, 750))
      if (identity !== options.getIdentity?.()) throw new ApiClientError('A sessao foi alterada.', { status: 409, code: 'RESPOSTA_OBSOLETA' })
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
    if (accepted.status !== 'SUCCEEDED') throw new ApiClientError(accepted.errorMessage ?? 'Nao foi possivel concluir a operacao.', {
      status: accepted.status === 'NEEDS_ATTENTION' ? 503 : 409, code: accepted.errorCode ?? 'OPERACAO_REJEITADA',
    })
    uncertainRequests.delete(signature)
    return kind === 'DELETE' ? { deleted: true } : accepted.item
  }

  return {
    listProviders: () => call((token) => listProvidersRequest(token)),
    connectProvider: (provider, redirectTo) =>
      call((token) => connectProviderRequest(token, provider, redirectTo)),
    disconnectProvider: (provider) => call((token) => disconnectProviderRequest(token, provider)),
    listFolder: (provider, parentRef, cursor) =>
      call((token) => listFolderRequest(token, provider, parentRef, cursor)),
    getItem: (provider, ref) => call((token) => getItemRequest(token, provider, ref)),
    createFolder: async (provider, parentRef, name) =>
      await operation(provider, 'CREATE_FOLDER', { parentRef, name }) ?? call((token) => createFolderRequest(token, provider, parentRef, name)),
    uploadFile: async (provider, parentRef, file) => {
      if (file.size > 50 * 1024 * 1024) throw new ApiClientError('O arquivo excede o limite de 50 MB.', { status: 400, code: 'ARQUIVO_GRANDE' })
      return await operation(provider, 'UPLOAD', { parentRef, name: file.name, contentType: file.type }, file) ?? call((token) => uploadFileRequest(token, provider, parentRef, file))
    },
    updateItem: async (provider, ref, patch) => await operation(provider, 'UPDATE', { ref, ...patch,
      ...(patch.parentRef !== undefined ? { parentRef: patch.parentRef || '' } : {}),
    }) ?? call((token) => updateItemRequest(token, provider, ref, patch)),
    deleteItem: async (provider, ref) => await operation(provider, 'DELETE', { ref }) ?? call((token) => deleteItemRequest(token, provider, ref)),
    getReadSource: (provider, ref, refresh = false) => call((token) => getReadSourceRequest(token, provider, ref, refresh)),
    listOperations: () => call(listOperations),
    retryOperation: (id) => call((token) => retryOperation(token, id)),
    createContentTicket: (provider, ref, disposition) =>
      call((token) => createContentTicketRequest(token, provider, ref, disposition)),
    search: (query) => call((token) => searchRequest(token, query)),
    listRecents: () => call((token) => listRecentsRequest(token)),
    recordRecent: (provider, ref) => call((token) => recordRecentRequest(token, provider, ref)),
    listShortcuts: () => call((token) => listShortcutsRequest(token)),
    addShortcut: (provider, ref) => call((token) => addShortcutRequest(token, provider, ref)),
    removeShortcut: (provider, ref) => call((token) => removeShortcutRequest(token, provider, ref)),
    getPublicLink: (provider, ref) => call((token) => getPublicLinkRequest(token, provider, ref)),
    enablePublicLink: (provider, ref) => call((token) => enablePublicLinkRequest(token, provider, ref)),
    disablePublicLink: (provider, ref) => call((token) => disablePublicLinkRequest(token, provider, ref)),
  }
}
