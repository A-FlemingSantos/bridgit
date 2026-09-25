import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addShortcut,
  connectProvider,
  createContentTicket,
  createFolder,
  deleteItem,
  disablePublicLink,
  disconnectProvider,
  enablePublicLink,
  getItem,
  getPublicLink,
  getReadSource,
  listFolder,
  listProviders,
  listRecents,
  listShortcuts,
  recordRecent,
  removeShortcut,
  search,
  updateItem,
  uploadFile,
} from './hub.js'
import { ApiClientError, apiRequest } from './apiClient.js'

vi.mock('./apiClient.js', () => ({
  apiRequest: vi.fn(),
  ApiClientError: class ApiClientError extends Error {
    constructor(message, options = {}) {
      super(message)
      this.name = 'ApiClientError'
      this.code = options.code ?? 'ERRO_API'
      this.status = options.status ?? 500
    }
  },
}))

const token = 'test-token'

beforeEach(() => {
  apiRequest.mockReset()
})

describe('hub api', () => {
  it('listProviders forwards token', async () => {
    apiRequest.mockResolvedValue([])
    await listProviders(token)
    expect(apiRequest).toHaveBeenCalledWith('/api/providers', { token })
  })

  it('connectProvider sends redirectTo when provided', async () => {
    apiRequest.mockResolvedValue({ authorizationUrl: 'https://oauth.example/connect' })
    await connectProvider(token, 'onedrive', '/providers/onedrive')
    expect(apiRequest).toHaveBeenCalledWith('/api/providers/onedrive/connect', {
      method: 'POST',
      token,
      body: { redirectTo: '/providers/onedrive' },
    })
  })

  it('connectProvider omits body when redirectTo is absent', async () => {
    apiRequest.mockResolvedValue({ authorizationUrl: 'https://oauth.example/connect' })
    await connectProvider(token, 'onedrive')
    expect(apiRequest).toHaveBeenCalledWith('/api/providers/onedrive/connect', {
      method: 'POST',
      token,
    })
  })

  it('disconnectProvider deletes provider', async () => {
    apiRequest.mockResolvedValue([])
    await disconnectProvider(token, 'dropbox')
    expect(apiRequest).toHaveBeenCalledWith('/api/providers/dropbox', {
      method: 'DELETE',
      token,
    })
  })

  it('listFolder encodes parent and cursor query params', async () => {
    apiRequest.mockResolvedValue({ folder: null, items: [], nextCursor: null })
    await listFolder(token, 'google-drive', 'folder/ref', 'cursor-1')
    expect(apiRequest).toHaveBeenCalledWith('/api/providers/google-drive/items', {
      token,
      query: { parent: 'folder/ref', cursor: 'cursor-1' },
    })
  })

  it('listFolder omits parent for provider root', async () => {
    apiRequest.mockResolvedValue({ folder: null, items: [], nextCursor: null })
    await listFolder(token, 'onedrive', null)
    expect(apiRequest).toHaveBeenCalledWith('/api/providers/onedrive/items', {
      token,
      query: {},
    })
  })

  it('getItem encodes ref in path', async () => {
    apiRequest.mockResolvedValue({ ref: 'a/b' })
    await getItem(token, 'onedrive', 'a/b')
    expect(apiRequest).toHaveBeenCalledWith('/api/providers/onedrive/items/a%2Fb', { token })
  })

  it('createFolder posts parentRef and name', async () => {
    apiRequest.mockResolvedValue({ ref: 'new-folder' })
    await createFolder(token, 'onedrive', null, 'Docs')
    expect(apiRequest).toHaveBeenCalledWith('/api/providers/onedrive/folders', {
      method: 'POST',
      token,
      body: { parentRef: null, name: 'Docs' },
    })
  })

  it('uploadFile rejects files over 50 MB', () => {
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' })
    Object.defineProperty(file, 'size', { value: 51 * 1024 * 1024 })
    expect(() => uploadFile(token, 'onedrive', null, file)).toThrow(/50 MB/)
    try {
      uploadFile(token, 'onedrive', null, file)
    } catch (error) {
      expect(error.code).toBe('ARQUIVO_GRANDE')
    }
  })

  it('uploadFile sends multipart body', async () => {
    const smallFile = new File(['hello'], 'hello.txt', { type: 'text/plain' })
    apiRequest.mockResolvedValue({ ref: 'file-1' })
    await uploadFile(token, 'onedrive', 'parent-1', smallFile)
    const [, options] = apiRequest.mock.calls.at(-1)
    expect(options.method).toBe('POST')
    expect(options.body).toBeInstanceOf(FormData)
    expect(options.body.get('parentRef')).toBe('parent-1')
    expect(options.body.get('file')).toBe(smallFile)
  })

  it('updateItem sends empty parentRef for root moves', async () => {
    apiRequest.mockResolvedValue({ ref: 'item-1' })
    await updateItem(token, 'onedrive', 'item-1', { parentRef: null })
    expect(apiRequest).toHaveBeenCalledWith('/api/providers/onedrive/items/item-1', {
      method: 'PATCH',
      token,
      body: { parentRef: '' },
    })
  })

  it('deleteItem deletes encoded ref', async () => {
    apiRequest.mockResolvedValue(undefined)
    await deleteItem(token, 'dropbox', 'x/y')
    expect(apiRequest).toHaveBeenCalledWith('/api/providers/dropbox/items/x%2Fy', {
      method: 'DELETE',
      token,
    })
  })

  it('getReadSource and createContentTicket hit read/ticket endpoints', async () => {
    apiRequest.mockResolvedValue({ mode: 'pdf', url: 'https://read' })
    await getReadSource(token, 'onedrive', 'doc.pdf')
    expect(apiRequest).toHaveBeenCalledWith('/api/providers/onedrive/items/doc.pdf/read', { token })

    apiRequest.mockResolvedValue({ url: 'https://ticket' })
    await createContentTicket(token, 'onedrive', 'doc.pdf', 'attachment')
    expect(apiRequest).toHaveBeenCalledWith('/api/providers/onedrive/items/doc.pdf/ticket', {
      method: 'POST',
      token,
      body: { disposition: 'attachment' },
    })
  })

  it('search queries /api/search', async () => {
    apiRequest.mockResolvedValue({ results: [], providers: [] })
    await search(token, 'budget')
    expect(apiRequest).toHaveBeenCalledWith('/api/search', {
      token,
      query: { q: 'budget' },
    })
  })

  it('hub recents and shortcuts endpoints', async () => {
    apiRequest.mockResolvedValue([])
    await listRecents(token)
    expect(apiRequest).toHaveBeenCalledWith('/api/hub/recents', { token })

    apiRequest.mockResolvedValue({ provider: 'onedrive', ref: 'a' })
    await recordRecent(token, 'onedrive', 'a')
    expect(apiRequest).toHaveBeenCalledWith('/api/hub/recents', {
      method: 'POST',
      token,
      body: { provider: 'onedrive', ref: 'a' },
    })

    apiRequest.mockResolvedValue([])
    await listShortcuts(token)
    expect(apiRequest).toHaveBeenCalledWith('/api/hub/shortcuts', { token })

    apiRequest.mockResolvedValue({ provider: 'onedrive', ref: 'a' })
    await addShortcut(token, 'onedrive', 'a/1')
    expect(apiRequest).toHaveBeenCalledWith('/api/hub/shortcuts/onedrive/a%2F1', {
      method: 'PUT',
      token,
    })

    apiRequest.mockResolvedValue(undefined)
    await removeShortcut(token, 'onedrive', 'a/1')
    expect(apiRequest).toHaveBeenCalledWith('/api/hub/shortcuts/onedrive/a%2F1', {
      method: 'DELETE',
      token,
    })
  })

  it('public link endpoints', async () => {
    apiRequest.mockResolvedValue(null)
    await getPublicLink(token, 'onedrive', 'doc')
    expect(apiRequest).toHaveBeenCalledWith('/api/providers/onedrive/items/doc/public-link', { token })

    apiRequest.mockResolvedValue({ url: 'https://public', suffix: 'abc' })
    await enablePublicLink(token, 'onedrive', 'doc')
    expect(apiRequest).toHaveBeenCalledWith('/api/providers/onedrive/items/doc/public-link', {
      method: 'PUT',
      token,
    })

    apiRequest.mockResolvedValue(undefined)
    await disablePublicLink(token, 'onedrive', 'doc')
    expect(apiRequest).toHaveBeenCalledWith('/api/providers/onedrive/items/doc/public-link', {
      method: 'DELETE',
      token,
    })
  })

  it('propagates ApiClientError from apiRequest', async () => {
    apiRequest.mockRejectedValue(new ApiClientError('Falhou', { code: 'ERRO', status: 500 }))
    await expect(listProviders(token)).rejects.toBeInstanceOf(ApiClientError)
  })
})
