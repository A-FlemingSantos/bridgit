import { isApiClientError, isHubSessionFailure } from './hubCache.js'
import {
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

export function createHubApi(getToken, onUnauthorized) {
  async function call(request) {
    const token = getToken()
    if (!token) {
      throw new Error('Sessao indisponivel.')
    }

    try {
      return await request(token)
    } catch (error) {
      if (isHubSessionFailure(error)) {
        onUnauthorized(error)
      }
      throw error
    }
  }

  return {
    listProviders: () => call((token) => listProvidersRequest(token)),
    connectProvider: (provider, redirectTo) =>
      call((token) => connectProviderRequest(token, provider, redirectTo)),
    disconnectProvider: (provider) => call((token) => disconnectProviderRequest(token, provider)),
    listFolder: (provider, parentRef, cursor) =>
      call((token) => listFolderRequest(token, provider, parentRef, cursor)),
    getItem: (provider, ref) => call((token) => getItemRequest(token, provider, ref)),
    createFolder: (provider, parentRef, name) =>
      call((token) => createFolderRequest(token, provider, parentRef, name)),
    uploadFile: (provider, parentRef, file) =>
      call((token) => uploadFileRequest(token, provider, parentRef, file)),
    updateItem: (provider, ref, patch) => call((token) => updateItemRequest(token, provider, ref, patch)),
    deleteItem: (provider, ref) => call((token) => deleteItemRequest(token, provider, ref)),
    getReadSource: (provider, ref) => call((token) => getReadSourceRequest(token, provider, ref)),
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
