import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addShortcut,
  connectProvider,
  connectionAvatarPath,
  createContentTicket,
  createFolder,
  deleteItem,
  disablePublicLink,
  disconnectConnection,
  disconnectProvider,
  enablePublicLink,
  getConnectionAvatar,
  getItem,
  getPublicLink,
  getReadSource,
  getThumbnail,
  listFolder,
  listProviders,
  listRecents,
  listPublicLinks,
  listShortcuts,
  recordRecent,
  removeShortcut,
  replaceFileContent,
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

  it('connectProvider sends addAccount only when requested', async () => {
    apiRequest.mockResolvedValue({ authorizationUrl: 'https://oauth.example/connect' })
    await connectProvider(token, 'onedrive', '/providers/onedrive', { addAccount: true })
    expect(apiRequest).toHaveBeenCalledWith('/api/providers/onedrive/connect', {
      method: 'POST',
      token,
      body: { redirectTo: '/providers/onedrive', addAccount: true },
    })

    apiRequest.mockClear()
    await connectProvider(token, 'onedrive', undefined, { addAccount: true })
    expect(apiRequest).toHaveBeenCalledWith('/api/providers/onedrive/connect', {
      method: 'POST',
      token,
      body: { addAccount: true },
    })

    apiRequest.mockClear()
    await connectProvider(token, 'onedrive', '/x', { addAccount: false })
    expect(apiRequest).toHaveBeenCalledWith('/api/providers/onedrive/connect', {
      method: 'POST',
      token,
      body: { redirectTo: '/x' },
    })

    apiRequest.mockClear()
    await connectProvider(token, 'onedrive', '/x', { allowAccountChange: true })
    expect(apiRequest.mock.calls[0][1].body).toEqual({ redirectTo: '/x' })
  })

  it('disconnectConnection deletes one connection', async () => {
    apiRequest.mockResolvedValue(undefined)
    await disconnectConnection(token, 'conn-1')
    expect(apiRequest).toHaveBeenCalledWith('/api/connections/conn-1', {
      method: 'DELETE',
      token,
    })
  })

  it('connection avatar path and blob request carry the generation', async () => {
    expect(connectionAvatarPath('conn-1', 3)).toBe('/api/connections/conn-1/avatar?v=3')
    expect(connectionAvatarPath('conn-1')).toBe('/api/connections/conn-1/avatar')
    const blob = new Blob(['img'])
    apiRequest.mockResolvedValue(blob)
    await expect(getConnectionAvatar(token, 'conn-1', 3)).resolves.toBe(blob)
    expect(apiRequest).toHaveBeenCalledWith('/api/connections/conn-1/avatar', {
      token,
      query: { v: 3 },
      responseType: 'blob',
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
    await listFolder(token, 'conn-g', 'folder/ref', 'cursor-1')
    expect(apiRequest).toHaveBeenCalledWith('/api/connections/conn-g/items', {
      token,
      query: { parent: 'folder/ref', cursor: 'cursor-1' },
    })
  })

  it('listFolder omits parent for provider root', async () => {
    apiRequest.mockResolvedValue({ folder: null, items: [], nextCursor: null })
    await listFolder(token, 'conn-1', null)
    expect(apiRequest).toHaveBeenCalledWith('/api/connections/conn-1/items', {
      token,
      query: {},
    })
  })

  it('getItem encodes ref in path', async () => {
    apiRequest.mockResolvedValue({ ref: 'a/b' })
    await getItem(token, 'conn-1', 'a/b')
    expect(apiRequest).toHaveBeenCalledWith('/api/connections/conn-1/items/a%2Fb', { token })
  })

  it('listFolder stamps connectionId onto items, folder and ancestry', async () => {
    apiRequest.mockResolvedValue({
      folder: { ref: 'f1', name: 'F', ancestry: [{ ref: null, name: 'Root' }] },
      items: [{ ref: 'a', name: 'A' }, { ref: 'b', name: 'B' }],
      nextCursor: 'next',
    })
    const result = await listFolder(token, 'conn-1', 'f1')
    expect(result.items.map((item) => item.connectionId)).toEqual(['conn-1', 'conn-1'])
    expect(result.folder.connectionId).toBe('conn-1')
    expect(result.folder.ancestry[0]).toEqual({ ref: null, name: 'Root', connectionId: 'conn-1' })
    expect(result.nextCursor).toBe('next')
  })

  it('getItem stamps connectionId onto the item and its ancestry', async () => {
    apiRequest.mockResolvedValue({ ref: 'a', name: 'A', ancestry: [{ ref: 'p', name: 'P' }] })
    const item = await getItem(token, 'conn-1', 'a')
    expect(item.connectionId).toBe('conn-1')
    expect(item.ancestry).toEqual([{ ref: 'p', name: 'P', connectionId: 'conn-1' }])
  })

  it('mutation results are stamped with connectionId', async () => {
    apiRequest.mockResolvedValue({ ref: 'x', name: 'X' })
    expect(await createFolder(token, 'conn-1', null, 'X')).toEqual({ ref: 'x', name: 'X', connectionId: 'conn-1' })
    expect(await uploadFile(token, 'conn-1', null, new File(['x'], 'x.txt'))).toMatchObject({ connectionId: 'conn-1' })
    expect(await updateItem(token, 'conn-1', 'x', { name: 'Y' })).toMatchObject({ connectionId: 'conn-1' })

    apiRequest.mockResolvedValue(undefined)
    expect(await updateItem(token, 'conn-1', 'x', { name: 'Y' })).toBeUndefined()
  })

  it('createFolder posts parentRef and name', async () => {
    apiRequest.mockResolvedValue({ ref: 'new-folder' })
    await createFolder(token, 'conn-1', null, 'Docs', { clientKey: 'folder-action' })
    expect(apiRequest).toHaveBeenCalledWith('/api/connections/conn-1/folders', {
      method: 'POST',
      token,
      body: { parentRef: null, name: 'Docs' },
      headers: { 'Idempotency-Key': 'folder-action' },
    })
  })

  it('uploadFile rejects the promise for files over 50 MB', async () => {
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' })
    Object.defineProperty(file, 'size', { value: 51 * 1024 * 1024 })
    const pending = uploadFile(token, 'conn-1', null, file)
    await expect(pending).rejects.toMatchObject({ code: 'ARQUIVO_GRANDE', status: 400 })
    await expect(pending).rejects.toThrow(/50 MB/)
    expect(apiRequest).not.toHaveBeenCalled()
  })

  it('uploadFile omits parentRef at the root', async () => {
    apiRequest.mockResolvedValue({ ref: 'file-2' })
    await uploadFile(token, 'conn-1', null, new File(['x'], 'x.txt'))
    await uploadFile(token, 'conn-1', '', new File(['x'], 'x.txt'))
    for (const [, options] of apiRequest.mock.calls) {
      expect(options.body.has('parentRef')).toBe(false)
    }
  })

  it('createFolder sends null for an empty root', async () => {
    apiRequest.mockResolvedValue({ ref: 'new-folder' })
    await createFolder(token, 'conn-1', '', 'Docs', { clientKey: 'k' })
    expect(apiRequest.mock.calls[0][1].body).toEqual({ parentRef: null, name: 'Docs' })
  })

  it('uploadFile sends multipart body', async () => {
    const smallFile = new File(['hello'], 'hello.txt', { type: 'text/plain' })
    apiRequest.mockResolvedValue({ ref: 'file-1' })
    await uploadFile(token, 'conn-1', 'parent-1', smallFile)
    const [, options] = apiRequest.mock.calls.at(-1)
    expect(options.method).toBe('POST')
    expect(options.body).toBeInstanceOf(FormData)
    expect(options.body.get('parentRef')).toBe('parent-1')
    expect(options.body.get('file')).toBe(smallFile)
    expect(options.headers['Idempotency-Key']).toEqual(expect.any(String))
  })

  it('replaceFileContent posts the file and the expected version to the item content route', async () => {
    const edited = new File(['texto'], 'a.txt', { type: 'text/plain' })
    apiRequest.mockResolvedValue({ ref: 'x/y', contentRevision: 'r2' })
    const saved = await replaceFileContent(token, 'conn-1', 'x/y', edited, 'r1', { clientKey: 'save-action' })
    const [path, options] = apiRequest.mock.calls[0]
    expect(path).toBe('/api/connections/conn-1/items/x%2Fy/content')
    expect(options.method).toBe('POST')
    expect(options.body.get('file')).toBe(edited)
    expect(options.body.get('expectedVersion')).toBe('r1')
    expect(options.headers).toEqual({ 'Idempotency-Key': 'save-action' })
    expect(saved).toEqual({ ref: 'x/y', contentRevision: 'r2', connectionId: 'conn-1' })
  })

  it('replaceFileContent refuses text over 2 MB before any request', async () => {
    const edited = new File(['x'], 'a.txt')
    Object.defineProperty(edited, 'size', { value: 2 * 1024 * 1024 + 1 })
    await expect(replaceFileContent(token, 'conn-1', 'ref', edited, 'r1')).rejects.toMatchObject({ code: 'TEXTO_GRANDE_DEMAIS', status: 400 })
    expect(apiRequest).not.toHaveBeenCalled()
  })

  it('updateItem sends empty parentRef for root moves', async () => {
    apiRequest.mockResolvedValue({ ref: 'item-1' })
    await updateItem(token, 'conn-1', 'item-1', { parentRef: null }, { clientKey: 'move-action' })
    expect(apiRequest).toHaveBeenCalledWith('/api/connections/conn-1/items/item-1', {
      method: 'PATCH',
      token,
      body: { parentRef: '' },
      headers: { 'Idempotency-Key': 'move-action' },
    })
  })

  it('deleteItem deletes encoded ref', async () => {
    apiRequest.mockResolvedValue(undefined)
    await deleteItem(token, 'conn-2', 'x/y', { clientKey: 'delete-action' })
    expect(apiRequest).toHaveBeenCalledWith('/api/connections/conn-2/items/x%2Fy', {
      method: 'DELETE',
      token,
      headers: { 'Idempotency-Key': 'delete-action' },
    })
  })

  it('uses distinct keys for new actions and preserves explicit keys for retries', async () => {
    apiRequest.mockResolvedValue({ ref: 'folder' })
    await createFolder(token, 'conn-1', null, 'Docs')
    await createFolder(token, 'conn-1', null, 'Docs')
    expect(apiRequest.mock.calls[0][1].headers['Idempotency-Key']).not.toBe(apiRequest.mock.calls[1][1].headers['Idempotency-Key'])
    const file = new File(['hello'], 'hello.txt')
    await uploadFile(token, 'conn-1', null, file, { clientKey: 'upload-action' })
    await uploadFile(token, 'conn-1', null, file, { clientKey: 'upload-action' })
    expect(apiRequest.mock.calls[2][1].headers['Idempotency-Key']).toBe('upload-action')
    expect(apiRequest.mock.calls[3][1].headers['Idempotency-Key']).toBe('upload-action')
  })

  it('getReadSource and createContentTicket hit read/ticket endpoints', async () => {
    apiRequest.mockResolvedValue({ mode: 'pdf', url: 'https://read' })
    await getReadSource(token, 'conn-1', 'doc.pdf')
    expect(apiRequest).toHaveBeenCalledWith('/api/connections/conn-1/items/doc.pdf/read', { token })

    apiRequest.mockResolvedValue({ url: 'https://ticket' })
    await createContentTicket(token, 'conn-1', 'doc.pdf', 'attachment')
    expect(apiRequest).toHaveBeenCalledWith('/api/connections/conn-1/items/doc.pdf/ticket', {
      method: 'POST',
      token,
      body: { disposition: 'attachment' },
    })

    apiRequest.mockResolvedValue(new Blob(['img']))
    await getThumbnail(token, 'conn-1', 'photo.jpg')
    expect(apiRequest).toHaveBeenCalledWith('/api/connections/conn-1/items/photo.jpg/thumbnail', {
      token,
      responseType: 'blob',
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

    apiRequest.mockResolvedValue({ connectionId: 'conn-1', ref: 'a' })
    await recordRecent(token, 'conn-1', 'a')
    expect(apiRequest).toHaveBeenCalledWith('/api/hub/recents', {
      method: 'POST',
      token,
      body: { connectionId: 'conn-1', ref: 'a' },
    })

    apiRequest.mockResolvedValue([])
    await listShortcuts(token)
    expect(apiRequest).toHaveBeenCalledWith('/api/hub/shortcuts', { token })

    apiRequest.mockResolvedValue([])
    await listPublicLinks(token)
    expect(apiRequest).toHaveBeenCalledWith('/api/hub/public-links', { token })

    apiRequest.mockResolvedValue({ connectionId: 'conn-1', ref: 'a/1' })
    await addShortcut(token, 'conn-1', 'a/1')
    expect(apiRequest).toHaveBeenCalledWith('/api/connections/conn-1/items/a%2F1/shortcut', {
      method: 'PUT',
      token,
    })

    apiRequest.mockResolvedValue(undefined)
    await removeShortcut(token, 'conn-1', 'a/1')
    expect(apiRequest).toHaveBeenCalledWith('/api/connections/conn-1/items/a%2F1/shortcut', {
      method: 'DELETE',
      token,
    })
  })

  it('public link endpoints', async () => {
    apiRequest.mockResolvedValue(null)
    await getPublicLink(token, 'conn-1', 'doc')
    expect(apiRequest).toHaveBeenCalledWith('/api/connections/conn-1/items/doc/public-link', { token })

    apiRequest.mockResolvedValue({ url: 'https://public', suffix: 'abc' })
    await enablePublicLink(token, 'conn-1', 'doc')
    expect(apiRequest).toHaveBeenCalledWith('/api/connections/conn-1/items/doc/public-link', {
      method: 'PUT',
      token,
    })

    apiRequest.mockResolvedValue(undefined)
    await disablePublicLink(token, 'conn-1', 'doc')
    expect(apiRequest).toHaveBeenCalledWith('/api/connections/conn-1/items/doc/public-link', {
      method: 'DELETE',
      token,
    })
  })

  it('propagates ApiClientError from apiRequest', async () => {
    apiRequest.mockRejectedValue(new ApiClientError('Falhou', { code: 'ERRO', status: 500 }))
    await expect(listProviders(token)).rejects.toBeInstanceOf(ApiClientError)
  })
})
