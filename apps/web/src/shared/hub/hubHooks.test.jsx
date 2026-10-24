import { act, renderHook, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError } from '@bridgit/shared-client'
import { SessionProvider } from '../auth/SessionContext.jsx'
import { HubDataProvider } from './HubDataProvider.jsx'
import { useConnection, useConnections, useFolder, useHubActions, useItem, useProviders, useRecents, useSearch, useShortcuts } from './hooks.js'
import { HubUploadError } from './hubErrors.js'
import { HUB_CHANNEL_NAME, broadcastHubEvent } from './hubChannel.js'
import { hubErrorMessage } from '../state/hubErrorMessage.js'
import { createHubApi } from './hubApi.js'
import { loadThumbnail } from './thumbnailQueue.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function badRequest(message = 'Falhou') {
  return new ApiClientError(message, { code: 'ERRO', status: 400 })
}

function badGateway() {
  return new ApiClientError('Falhou', { code: 'ERRO', status: 502 })
}

vi.mock('./hubChannel.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, broadcastHubEvent: vi.fn(actual.broadcastHubEvent) }
})

vi.mock('./hubApi.js', () => ({
  createHubApi: vi.fn(),
}))

vi.mock('@bridgit/shared-client', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    apiRequest: vi.fn(async (path) => {
      if (path === '/api/auth/refresh') {
        return {
          accessToken: 'test-token',
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          user: { id: 'user-1', username: 'arthur' },
          session: {
            id: 'session-1',
            persistent: true,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            clientKind: 'web',
          },
        }
      }
      throw new Error(`Unexpected apiRequest path: ${path}`)
    }),
  }
})

const sampleItem = {
  ref: 'file-1',
  connectionId: 'conn-1',
  provider: 'onedrive',
  name: 'Relatorio.pdf',
  kind: 'file',
  mimeType: 'application/pdf',
  extension: 'pdf',
  size: 1200,
  modifiedAt: '2026-01-01T00:00:00.000Z',
  parentRef: null,
}

const oneDriveConnection = {
  connectionId: 'conn-1', provider: 'onedrive', providerName: 'OneDrive', account: { email: 'a@outlook.com' },
  generation: 1, operationsEnabled: false,
}
const oneDriveRow = { id: 'onedrive', name: 'OneDrive', configured: true, connected: true, connections: [oneDriveConnection] }

const hubApiMock = {
  listProviders: vi.fn().mockResolvedValue([]),
  connectProvider: vi.fn(),
  disconnectProvider: vi.fn(),
  disconnectConnection: vi.fn(),
  getConnectionAvatar: vi.fn(),
  listPublicLinks: vi.fn(),
  listFolder: vi.fn(),
  getItem: vi.fn(),
  createFolder: vi.fn(),
  uploadFile: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
  getReadSource: vi.fn(),
  createContentTicket: vi.fn(),
  search: vi.fn(),
  listRecents: vi.fn(),
  recordRecent: vi.fn(),
  listShortcuts: vi.fn(),
  addShortcut: vi.fn(),
  removeShortcut: vi.fn(),
  getPublicLink: vi.fn(),
  enablePublicLink: vi.fn(),
  disablePublicLink: vi.fn(),
}

function seedAuthenticatedSession() {
  localStorage.setItem(
    'bridgit.session',
    JSON.stringify({
      accessToken: 'test-token',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      user: { id: 'user-1', username: 'arthur' },
      session: {
            id: 'session-1',
            persistent: true,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            clientKind: 'web',
          },
    }),
  )
}

function createWrapper() {
  return function Wrapper({ children }) {
    return (
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SessionProvider>
          <HubDataProvider>{children}</HubDataProvider>
        </SessionProvider>
      </MemoryRouter>
    )
  }
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  seedAuthenticatedSession()
  Object.values(hubApiMock).forEach((mockFn) => {
    if (typeof mockFn.mockReset === 'function') {
      mockFn.mockReset()
    }
  })
  hubApiMock.listProviders.mockResolvedValue([])
  createHubApi.mockReturnValue(hubApiMock)
})

describe('hub hooks', () => {
  it('força um novo descritor na recuperação mesmo com autorização de cache válida', async () => {
    const source = {
      mode: 'text', url: '/ticket-1', revision: 'r-1', connectionId: 'connection-1', generation: 1,
      authorizedUntil: new Date(Date.now() + 60_000).toISOString(),
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    }
    hubApiMock.getReadSource.mockResolvedValueOnce(source).mockResolvedValueOnce({ ...source, url: '/ticket-2' })
    const { result } = renderHook(() => ({ providers: useProviders(), actions: useHubActions() }), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.providers.status).toBe('ready'))
    let first
    let cached
    let fresh
    await act(async () => {
      first = await result.current.actions.getReadSource({ connectionId: 'conn-1', ref: 'file-1' })
      cached = await result.current.actions.getReadSource({ connectionId: 'conn-1', ref: 'file-1' })
      fresh = await result.current.actions.getReadSource({ connectionId: 'conn-1', ref: 'file-1', refresh: true })
    })
    expect(cached).toBe(first)
    expect(fresh.url).toBe('/ticket-2')
    expect(hubApiMock.getReadSource).toHaveBeenCalledTimes(2)
    expect(hubApiMock.getReadSource).toHaveBeenLastCalledWith('conn-1', 'file-1', true)
  })

  it('não reutiliza ticket expirado quando a verificação do cache prolongou a autorização', async () => {
    const source = {
      mode: 'text', url: '/expired', revision: 'r-1', connectionId: 'connection-1', generation: 1,
      authorizedUntil: new Date(Date.now() + 60_000).toISOString(),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    }
    hubApiMock.getReadSource.mockResolvedValueOnce(source).mockResolvedValueOnce({ ...source, url: '/renewed', expiresAt: new Date(Date.now() + 300_000).toISOString() })
    const { result } = renderHook(() => ({ providers: useProviders(), actions: useHubActions() }), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.providers.status).toBe('ready'))
    let fresh
    await act(async () => {
      await result.current.actions.getReadSource({ connectionId: 'conn-1', ref: 'file-1' })
      fresh = await result.current.actions.getReadSource({ connectionId: 'conn-1', ref: 'file-1' })
    })
    expect(fresh.url).toBe('/renewed')
    expect(hubApiMock.getReadSource).toHaveBeenCalledTimes(2)
  })

  it('pasta que o provedor diz não existir sai da lista na hora e aponta para onde voltar', async () => {
    const folder = { ...sampleItem, ref: 'folder-1', name: 'Fotos', kind: 'folder', parentRef: null, parentKnown: true }
    hubApiMock.listFolder.mockImplementation(async (_provider, ref) => {
      if (ref === 'folder-1') throw new ApiClientError('Item não encontrado.', { code: 'ITEM_NAO_ENCONTRADO', status: 404 })
      return { folder: { ref: null, name: 'OneDrive', ancestry: [] }, items: [folder, sampleItem], nextCursor: null }
    })

    const { result } = renderHook(
      () => ({ root: useFolder('conn-1', null), gone: useFolder('conn-1', 'folder-1') }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.gone.status).toBe('gone'))
    expect(result.current.gone.parentRef).toBeNull()
    await waitFor(() => expect(result.current.root.items.map((item) => item.ref)).toEqual(['file-1']))
  })

  it('arquivo que o provedor diz não existir sai da lista ao tentar abrir', async () => {
    hubApiMock.listFolder.mockResolvedValue({ folder: { ref: null, name: 'OneDrive', ancestry: [] }, items: [sampleItem], nextCursor: null })
    hubApiMock.getReadSource.mockRejectedValue(new ApiClientError('Item não encontrado.', { code: 'ITEM_NAO_ENCONTRADO', status: 404 }))

    const { result } = renderHook(
      () => ({ root: useFolder('conn-1', null), item: useItem('conn-1', 'file-1'), actions: useHubActions() }),
      { wrapper: createWrapper() },
    )
    await waitFor(() => expect(result.current.root.items).toHaveLength(1))

    await act(async () => {
      await expect(result.current.actions.getReadSource({ connectionId: 'conn-1', ref: 'file-1' })).rejects.toBeInstanceOf(ApiClientError)
    })

    expect(result.current.root.items).toHaveLength(0)
    expect(result.current.item.status).toBe('gone')
  })

  it('outras falhas ao abrir uma pasta não a tiram da lista', async () => {
    const folder = { ...sampleItem, ref: 'folder-1', name: 'Fotos', kind: 'folder' }
    hubApiMock.listFolder.mockImplementation(async (_provider, ref) => {
      if (ref === 'folder-1') throw badGateway()
      return { folder: { ref: null, name: 'OneDrive', ancestry: [] }, items: [folder], nextCursor: null }
    })

    const { result } = renderHook(
      () => ({ root: useFolder('conn-1', null), other: useFolder('conn-1', 'folder-1') }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.other.status).toBe('error'))
    expect(result.current.root.items.map((item) => item.ref)).toEqual(['folder-1'])
  })

  it('reverte rename otimista quando a API falha', async () => {
    hubApiMock.listFolder.mockResolvedValue({
      folder: { ref: null, name: 'OneDrive', ancestry: [] },
      items: [sampleItem],
      nextCursor: null,
    })
    hubApiMock.updateItem.mockRejectedValue(new ApiClientError('Falhou', { code: 'ERRO', status: 400 }))

    const { result } = renderHook(
      () => ({
        folder: useFolder('conn-1', null),
        actions: useHubActions(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.folder.status).toBe('ready')
    })

    await expect(
      act(async () => {
        await result.current.actions.renameItem({
          connectionId: 'conn-1',
          ref: 'file-1',
          name: 'Novo nome.pdf',
        })
      }),
    ).rejects.toBeInstanceOf(ApiClientError)

    expect(result.current.folder.items[0].name).toBe('Relatorio.pdf')
  })

  it('reverte delete otimista quando a API falha', async () => {
    hubApiMock.listFolder.mockResolvedValue({
      folder: { ref: null, name: 'OneDrive', ancestry: [] },
      items: [sampleItem],
      nextCursor: null,
    })
    hubApiMock.deleteItem.mockRejectedValue(new ApiClientError('Falhou', { code: 'ERRO', status: 400 }))

    const { result } = renderHook(
      () => ({
        folder: useFolder('conn-1', null),
        actions: useHubActions(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.folder.items).toHaveLength(1)
    })

    await expect(
      act(async () => {
        await result.current.actions.deleteItem({
          connectionId: 'conn-1',
          ref: 'file-1',
          parentRef: null,
        })
      }),
    ).rejects.toBeInstanceOf(ApiClientError)

    expect(result.current.folder.items).toHaveLength(1)
    expect(result.current.folder.items[0].ref).toBe('file-1')
  })

  it('mantem uiKey ao substituir placeholder de upload', async () => {
    hubApiMock.listFolder.mockResolvedValue({
      folder: { ref: null, name: 'OneDrive', ancestry: [] },
      items: [],
      nextCursor: null,
    })
    hubApiMock.uploadFile.mockResolvedValue({
      ...sampleItem,
      ref: 'server-file-1',
      name: 'Novo.txt',
    })

    const { result } = renderHook(
      () => ({
        folder: useFolder('conn-1', null),
        actions: useHubActions(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.folder.status).toBe('ready')
    })

    const file = new File(['conteudo'], 'Novo.txt', { type: 'text/plain' })
    let uploaded = []

    await act(async () => {
      uploaded = await result.current.actions.uploadFiles({
        connectionId: 'conn-1',
        parentRef: null,
        files: [file],
      })
    })

    expect(uploaded).toHaveLength(1)
    expect(uploaded[0].ref).toBe('server-file-1')
    expect(result.current.folder.items[0].uiKey).toBe(uploaded[0].uiKey)
    expect(result.current.folder.items[0].pending).toBeUndefined()
  })

  it('debounceia busca e ignora respostas obsoletas', async () => {
    let resolveAlpha
    hubApiMock.search.mockImplementation((query) => {
      if (query === 'alpha') {
        return new Promise((resolve) => {
          resolveAlpha = () => resolve({ results: [{ ...sampleItem, name: 'alpha-result' }], providers: [] })
        })
      }
      return Promise.resolve({ results: [{ ...sampleItem, name: 'beta-result' }], providers: [] })
    })

    const { result, rerender } = renderHook(({ query }) => useSearch(query), {
      wrapper: createWrapper(),
      initialProps: { query: '' },
    })

    await waitFor(() => {
      expect(localStorage.getItem('bridgit.session')).toBeTruthy()
    })

    vi.useFakeTimers()

    rerender({ query: 'alpha' })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current.status).toBe('loading')

    rerender({ query: 'beta' })
    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
    })

    expect(result.current.status).toBe('ready')
    expect(result.current.results[0]?.name).toBe('beta-result')

    await act(async () => {
      resolveAlpha?.()
      await Promise.resolve()
    })

    expect(result.current.results[0]?.name).toBe('beta-result')
    expect(hubApiMock.search).toHaveBeenCalledWith('beta')
  })
})

describe('hub findings', () => {
  it('F05 mescla itens otimistas com a primeira pagina ao visitar a pasta', async () => {
    const firstPage = deferred()
    const createReq = deferred()
    const uploadReq = deferred()
    hubApiMock.listFolder.mockReturnValue(firstPage.promise)
    hubApiMock.createFolder.mockReturnValue(createReq.promise)
    hubApiMock.uploadFile.mockReturnValue(uploadReq.promise)

    const { result } = renderHook(
      () => ({
        folder: useFolder('conn-1', null),
        actions: useHubActions(),
      }),
      { wrapper: createWrapper() },
    )

    let createPromise
    let uploadPromise
    act(() => {
      createPromise = result.current.actions.createFolder({
        connectionId: 'conn-1',
        parentRef: null,
        name: 'Nova pasta',
      })
      createPromise.catch(() => {})
      uploadPromise = result.current.actions.uploadFiles({
        connectionId: 'conn-1',
        parentRef: null,
        files: [new File(['a'], 'a.txt', { type: 'text/plain' })],
      })
      uploadPromise.catch(() => {})
    })

    await act(async () => {
      firstPage.resolve({
        folder: { ref: null, name: 'OneDrive', ancestry: [] },
        items: [sampleItem],
        nextCursor: 'cursor-1',
      })
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(result.current.folder.status).toBe('ready')
    })
    const pendingRefs = result.current.folder.items.map((item) => item.ref)
    expect(pendingRefs).toContain('file-1')
    expect(result.current.folder.items.some((item) => item.pending)).toBe(true)
    expect(result.current.folder.nextCursor).toBe('cursor-1')

    await act(async () => {
      createReq.resolve({ ref: 'folder-new', connectionId: 'conn-1', name: 'Nova pasta', kind: 'folder', parentRef: null })
      uploadReq.resolve({ ref: 'server-a', connectionId: 'conn-1', name: 'a.txt', kind: 'file', parentRef: null })
      await createPromise
      await uploadPromise
    })

    const refs = result.current.folder.items.map((item) => item.ref)
    expect(refs).toContain('file-1')
    expect(refs).toContain('folder-new')
    expect(refs).toContain('server-a')
    expect(refs.filter((ref) => ref === 'server-a')).toHaveLength(1)
    expect(result.current.folder.nextCursor).toBe('cursor-1')
  })

  it('F06 delete remove de todas as listagens', async () => {
    const rootFile = { ...sampleItem, ref: 'file-1', parentRef: 'root-id' }
    const subFile = { ...sampleItem, ref: 'file-2', name: 'Outro.pdf', parentRef: 'sub-1' }
    hubApiMock.listFolder.mockImplementation(async (connectionId, folderRef) => {
      if (!folderRef) {
        return { folder: { ref: null, name: 'OneDrive', ancestry: [] }, items: [rootFile], nextCursor: null }
      }
      return { folder: { ref: 'sub-1', name: 'Sub', ancestry: [] }, items: [subFile], nextCursor: null }
    })
    hubApiMock.listRecents.mockResolvedValue([{ ...rootFile }])
    hubApiMock.listShortcuts.mockResolvedValue([{ ...rootFile }])
    hubApiMock.deleteItem.mockResolvedValue({ ok: true })

    const { result } = renderHook(
      () => ({
        root: useFolder('conn-1', null),
        sub: useFolder('conn-1', 'sub-1'),
        recents: useRecents(),
        shortcuts: useShortcuts(),
        actions: useHubActions(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.root.status).toBe('ready')
      expect(result.current.sub.status).toBe('ready')
      expect(result.current.recents.status).toBe('ready')
      expect(result.current.shortcuts.status).toBe('ready')
    })

    await act(async () => {
      await result.current.actions.deleteItem({ connectionId: 'conn-1', ref: 'file-1' })
    })

    expect(result.current.root.items.some((item) => item.ref === 'file-1')).toBe(false)
    expect(result.current.sub.items.map((item) => item.ref)).toEqual(['file-2'])
    expect(result.current.recents.entries.some((entry) => entry.ref === 'file-1')).toBe(false)
    expect(result.current.shortcuts.entries.some((entry) => entry.ref === 'file-1')).toBe(false)
  })

  it('F06 move entre subpasta e raiz sem depender das dicas', async () => {
    const subFile = { ...sampleItem, ref: 'file-2', name: 'Outro.pdf', parentRef: 'sub-1' }
    hubApiMock.listFolder.mockImplementation(async (connectionId, folderRef) => {
      if (!folderRef) {
        return { folder: { ref: null, name: 'OneDrive', ancestry: [] }, items: [{ ...sampleItem }], nextCursor: null }
      }
      return { folder: { ref: 'sub-1', name: 'Sub', ancestry: [] }, items: [{ ...subFile }], nextCursor: null }
    })
    hubApiMock.updateItem.mockImplementation(async (connectionId, ref, patch) => ({
      ...(ref === 'file-2' ? subFile : sampleItem),
      ...patch,
    }))

    const { result } = renderHook(
      () => ({
        root: useFolder('conn-1', null),
        sub: useFolder('conn-1', 'sub-1'),
        actions: useHubActions(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.root.status).toBe('ready')
      expect(result.current.sub.status).toBe('ready')
    })

    await act(async () => {
      await result.current.actions.moveItem({ connectionId: 'conn-1', ref: 'file-2', fromParentRef: 'sub-1', parentRef: null })
    })
    expect(result.current.sub.items.some((item) => item.ref === 'file-2')).toBe(false)
    expect(result.current.root.items.some((item) => item.ref === 'file-2')).toBe(true)

    await act(async () => {
      await result.current.actions.moveItem({ connectionId: 'conn-1', ref: 'file-1', fromParentRef: undefined, parentRef: 'sub-1' })
    })
    expect(result.current.root.items.some((item) => item.ref === 'file-1')).toBe(false)
    expect(result.current.sub.items.some((item) => item.ref === 'file-1')).toBe(true)
  })

  it('F07 falha parcial de upload mantem sucessos e rejeita HubUploadError', async () => {
    hubApiMock.listFolder.mockResolvedValue({
      folder: { ref: null, name: 'OneDrive', ancestry: [] },
      items: [{ ...sampleItem }],
      nextCursor: null,
    })
    hubApiMock.uploadFile.mockImplementation(async (connectionId, parentRef, file) => {
      if (file.name === 'b.txt') throw badRequest('Falha em b')
      return { ref: `server-${file.name}`, connectionId, name: file.name, kind: 'file', parentRef }
    })

    const { result } = renderHook(
      () => ({
        folder: useFolder('conn-1', null),
        actions: useHubActions(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.folder.status).toBe('ready')
    })

    const files = [
      new File(['a'], 'a.txt', { type: 'text/plain' }),
      new File(['b'], 'b.txt', { type: 'text/plain' }),
      new File(['c'], 'c.txt', { type: 'text/plain' }),
    ]
    let failure = null
    await act(async () => {
      try {
        await result.current.actions.uploadFiles({ connectionId: 'conn-1', parentRef: null, files })
      } catch (error) {
        failure = error
      }
    })

    expect(failure).toBeInstanceOf(HubUploadError)
    expect(failure.uploaded.map((item) => item.ref).sort()).toEqual(['server-a.txt', 'server-c.txt'])
    expect(failure.failed).toHaveLength(1)
    expect(failure.failed[0].file.name).toBe('b.txt')
    expect(hubErrorMessage(failure)).toBe('2 de 3 arquivos enviados. Falhou: b.txt.')

    const refs = result.current.folder.items.map((item) => item.ref)
    expect(refs).toContain('file-1')
    expect(refs).toContain('server-a.txt')
    expect(refs).toContain('server-c.txt')
    expect(refs.some((ref) => String(ref).includes('temp-'))).toBe(false)
    const uploadedItem = result.current.folder.items.find((item) => item.ref === 'server-a.txt')
    expect(uploadedItem.uiKey).toBe(failure.uploaded.find((item) => item.ref === 'server-a.txt').uiKey)
    expect(uploadedItem.pending).toBeUndefined()

    await act(async () => {
      let retryFailure = null
      try {
        await result.current.actions.uploadFiles({
          connectionId: 'conn-1',
          parentRef: null,
          files: [files[1]],
        })
      } catch (error) {
        retryFailure = error
      }
      expect(retryFailure).toBeInstanceOf(HubUploadError)
      expect(retryFailure.failed[0].file.name).toBe('b.txt')
    })
    hubApiMock.uploadFile.mockImplementation(async (connectionId, parentRef, file) => ({
      ref: `server-${file.name}`,
      connectionId,
      name: file.name,
      kind: 'file',
      parentRef,
    }))
    await act(async () => {
      await result.current.actions.uploadFiles({ connectionId: 'conn-1', parentRef: null, files: [files[1]] })
    })
    expect(result.current.folder.items.some((item) => item.ref === 'server-b.txt')).toBe(true)
  })

  it('F07 falha no primeiro e no ultimo preserva os demais', async () => {
    hubApiMock.listFolder.mockResolvedValue({
      folder: { ref: null, name: 'OneDrive', ancestry: [] },
      items: [],
      nextCursor: null,
    })
    hubApiMock.uploadFile.mockImplementation(async (connectionId, parentRef, file) => {
      if (file.name === 'a.txt' || file.name === 'c.txt') throw badRequest(`Falha em ${file.name}`)
      return { ref: `server-${file.name}`, connectionId, name: file.name, kind: 'file', parentRef }
    })

    const { result } = renderHook(
      () => ({
        folder: useFolder('conn-1', null),
        actions: useHubActions(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.folder.status).toBe('ready')
    })

    let failure = null
    await act(async () => {
      try {
        await result.current.actions.uploadFiles({
          connectionId: 'conn-1',
          parentRef: null,
          files: [
            new File(['a'], 'a.txt', { type: 'text/plain' }),
            new File(['b'], 'b.txt', { type: 'text/plain' }),
            new File(['c'], 'c.txt', { type: 'text/plain' }),
          ],
        })
      } catch (error) {
        failure = error
      }
    })

    expect(failure).toBeInstanceOf(HubUploadError)
    expect(failure.uploaded.map((item) => item.ref)).toEqual(['server-b.txt'])
    expect(failure.failed.map((entry) => entry.file.name).sort()).toEqual(['a.txt', 'c.txt'])
    const refs = result.current.folder.items.map((item) => item.ref)
    expect(refs).toContain('server-b.txt')
    expect(refs.some((ref) => String(ref).includes('temp-'))).toBe(false)
  })

  it('F08 rollback por operacao mantem B quando A falha', async () => {
    hubApiMock.listFolder.mockImplementation(async (connectionId, folderRef) => {
      if (!folderRef) {
        return { folder: { ref: null, name: 'OneDrive', ancestry: [] }, items: [{ ...sampleItem }], nextCursor: null }
      }
      return { folder: { ref: 'sub-1', name: 'Sub', ancestry: [] }, items: [], nextCursor: null }
    })
    const gateA = deferred()
    hubApiMock.updateItem.mockImplementation((connectionId, ref, patch) => {
      if (patch.name === 'A.pdf') return gateA.promise
      return Promise.resolve({ ...sampleItem, ...patch })
    })
    hubApiMock.createFolder.mockImplementation(async (connectionId, parentRef, name) => ({
      ref: `created-${parentRef ?? 'root'}`,
      connectionId,
      name,
      kind: 'folder',
      parentRef,
    }))

    const { result } = renderHook(
      () => ({
        root: useFolder('conn-1', null),
        sub: useFolder('conn-1', 'sub-1'),
        actions: useHubActions(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.root.status).toBe('ready')
      expect(result.current.sub.status).toBe('ready')
    })

    let promiseA
    act(() => {
      promiseA = result.current.actions.renameItem({ connectionId: 'conn-1', ref: 'file-1', name: 'A.pdf' })
      promiseA.catch(() => {})
    })
    await act(async () => {
      await result.current.actions.renameItem({ connectionId: 'conn-1', ref: 'file-1', name: 'B.pdf' })
    })
    await act(async () => {
      gateA.reject(badRequest())
      await expect(promiseA).rejects.toBeInstanceOf(ApiClientError)
    })
    expect(result.current.root.items.find((item) => item.ref === 'file-1').name).toBe('B.pdf')

    const gateC = deferred()
    hubApiMock.createFolder.mockImplementation((connectionId, parentRef) => {
      if (!parentRef) return gateC.promise
      return Promise.resolve({ ref: 'created-sub-1', connectionId, name: 'Sub pasta', kind: 'folder', parentRef })
    })
    let promiseC
    act(() => {
      promiseC = result.current.actions.createFolder({ connectionId: 'conn-1', parentRef: null, name: 'Pasta A' })
      promiseC.catch(() => {})
    })
    await act(async () => {
      await result.current.actions.createFolder({ connectionId: 'conn-1', parentRef: 'sub-1', name: 'Sub pasta' })
    })
    await act(async () => {
      gateC.reject(badRequest())
      await expect(promiseC).rejects.toBeInstanceOf(ApiClientError)
    })
    expect(result.current.sub.items.some((item) => item.ref === 'created-sub-1')).toBe(true)
    expect(result.current.root.items.some((item) => item.name === 'Pasta A')).toBe(false)
  })

  it('F08 delete que falha nao apaga criacao concorrente', async () => {
    hubApiMock.listFolder.mockResolvedValue({
      folder: { ref: null, name: 'OneDrive', ancestry: [] },
      items: [{ ...sampleItem }],
      nextCursor: null,
    })
    const gateDelete = deferred()
    hubApiMock.deleteItem.mockReturnValue(gateDelete.promise)
    hubApiMock.createFolder.mockImplementation(async (connectionId, parentRef, name) => ({
      ref: 'created-new',
      connectionId,
      name,
      kind: 'folder',
      parentRef,
    }))

    const { result } = renderHook(
      () => ({
        folder: useFolder('conn-1', null),
        actions: useHubActions(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.folder.status).toBe('ready')
    })

    let deletePromise
    act(() => {
      deletePromise = result.current.actions.deleteItem({ connectionId: 'conn-1', ref: 'file-1' })
      deletePromise.catch(() => {})
    })
    await act(async () => {
      await result.current.actions.createFolder({ connectionId: 'conn-1', parentRef: null, name: 'Nova' })
    })
    await act(async () => {
      gateDelete.reject(badRequest())
      await expect(deletePromise).rejects.toBeInstanceOf(ApiClientError)
    })

    const refs = result.current.folder.items.map((item) => item.ref)
    expect(refs).toContain('file-1')
    expect(refs).toContain('created-new')
  })

  it('F09 revalida ao focar quando obsoleto e expurga ao desconectar', async () => {
    let disconnected = false
    hubApiMock.listFolder.mockResolvedValue({
      folder: { ref: null, name: 'OneDrive', ancestry: [] },
      items: [{ ...sampleItem }],
      nextCursor: null,
    })
    hubApiMock.listRecents.mockImplementation(async () => (disconnected ? [] : [{ ...sampleItem }]))
    hubApiMock.listShortcuts.mockResolvedValue([{ ...sampleItem }])
    hubApiMock.getItem.mockImplementation(async (connectionId, ref) => ({ ...sampleItem, ref, ancestry: [] }))
    hubApiMock.listProviders.mockResolvedValue([oneDriveRow])
    hubApiMock.disconnectProvider.mockImplementation(async () => {
      disconnected = true
      return [{ ...oneDriveRow, connected: false, connections: [] }]
    })

    const { result } = renderHook(
      () => ({
        folder: useFolder('conn-1', null),
        item: useItem('conn-1', 'file-1'),
        recents: useRecents(),
        providers: useProviders(),
        actions: useHubActions(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.folder.status).toBe('ready')
      expect(result.current.recents.status).toBe('ready')
    })
    expect(hubApiMock.listFolder).toHaveBeenCalledTimes(1)

    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31 * 1000)
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    nowSpy.mockRestore()

    await waitFor(() => {
      expect(hubApiMock.listFolder.mock.calls.length).toBeGreaterThan(1)
    })

    hubApiMock.listFolder.mockRejectedValue(new ApiClientError('Gone', { code: 'ERRO', status: 400 }))
    hubApiMock.getItem.mockRejectedValue(new ApiClientError('Gone', { code: 'ERRO', status: 400 }))
    await act(async () => {
      await result.current.providers.disconnect('onedrive')
    })

    await waitFor(
      () => {
        expect(result.current.folder.items).toHaveLength(0)
      },
      { timeout: 3000 },
    )
    expect(result.current.recents.entries.some((entry) => entry.connectionId === 'conn-1')).toBe(false)
    expect(result.current.item.item).toBeNull()
  })

  it('cursor recusado pelo servidor recarrega a pasta desde a primeira pagina', async () => {
    hubApiMock.listFolder.mockImplementation(async (connectionId, folderRef, cursor) => {
      if (cursor) throw new ApiClientError('Cursor', { code: 'CURSOR_INVALIDO', status: 400 })
      return {
        folder: { ref: null, name: 'OneDrive', ancestry: [] },
        items: [{ ...sampleItem, ref: 'page-1' }],
        nextCursor: 'sealed-old',
      }
    })

    const { result } = renderHook(() => useFolder('conn-1', null), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await act(async () => {
      await result.current.loadMore()
    })

    await waitFor(() => {
      expect(hubApiMock.listFolder).toHaveBeenCalledTimes(3)
    })
    expect(hubApiMock.listFolder.mock.calls[2][2] ?? null).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.items.map((item) => item.ref)).toEqual(['page-1'])
  })

  it('F09 resposta tardia apos invalidacao nao repopula a pasta', async () => {
    const first = deferred()
    const second = deferred()
    hubApiMock.listFolder.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    hubApiMock.listFolder.mockResolvedValue({
      folder: { ref: null, name: 'OneDrive', ancestry: [] },
      items: [],
      nextCursor: null,
    })

    const { result } = renderHook(
      () => ({
        folder: useFolder('conn-1', null),
        actions: useHubActions(),
      }),
      { wrapper: createWrapper() },
    )

    await act(async () => {
      await Promise.resolve()
    })
    act(() => {
      void result.current.folder.reload()
    })
    await act(async () => {
      first.resolve({
        folder: { ref: null, name: 'OneDrive', ancestry: [] },
        items: [{ ...sampleItem, ref: 'stale-1', name: 'Obsoleto.pdf' }],
        nextCursor: null,
      })
      await Promise.resolve()
    })
    await act(async () => {
      second.resolve({
        folder: { ref: null, name: 'OneDrive', ancestry: [] },
        items: [{ ...sampleItem, ref: 'fresh-1', name: 'Atual.pdf' }],
        nextCursor: null,
      })
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(result.current.folder.items.some((item) => item.ref === 'fresh-1')).toBe(true)
    })
    expect(result.current.folder.items.some((item) => item.ref === 'stale-1')).toBe(false)
  })

  it('F09 mensagem de broadcast invalida a pasta', async () => {
    hubApiMock.listFolder.mockResolvedValue({
      folder: { ref: null, name: 'OneDrive', ancestry: [] },
      items: [{ ...sampleItem }],
      nextCursor: null,
    })

    const { result } = renderHook(
      () => ({
        folder: useFolder('conn-1', null),
        actions: useHubActions(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.folder.status).toBe('ready')
    })
    expect(hubApiMock.listFolder).toHaveBeenCalledTimes(1)

    if (typeof BroadcastChannel === 'undefined') {
      expect(result.current.folder.items).toHaveLength(1)
      return
    }

    const channel = new BroadcastChannel(HUB_CHANNEL_NAME)
    await act(async () => {
      channel.postMessage({ type: 'invalidate', scope: 'folder', connectionId: 'conn-1', keys: ['conn-1:root'], source: 'other-tab' })
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    channel.close()

    await waitFor(() => {
      expect(hubApiMock.listFolder.mock.calls.length).toBeGreaterThan(1)
    })
  })

  it('F11 useItem busca detalhes quando o cache veio da listagem', async () => {
    hubApiMock.listFolder.mockResolvedValue({
      folder: { ref: null, name: 'OneDrive', ancestry: [] },
      items: [{ ...sampleItem }],
      nextCursor: null,
    })
    hubApiMock.getItem.mockImplementation(async (connectionId, ref) => ({
      ...sampleItem,
      ref,
      ancestry: [{ ref: 'sub-1', name: 'Sub' }],
    }))

    const { result } = renderHook(
      () => ({
        folder: useFolder('conn-1', null),
        item: useItem('conn-1', 'file-1'),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.folder.status).toBe('ready')
    })
    expect(result.current.item.item?.name).toBe('Relatorio.pdf')

    await waitFor(() => {
      expect(hubApiMock.getItem).toHaveBeenCalledWith('conn-1', 'file-1')
      expect(result.current.item.item?.ancestry).toEqual([{ ref: 'sub-1', name: 'Sub' }])
    })
  })

  it('F23 erro ambiguo no rename refaz a leitura e vale o servidor', async () => {
    hubApiMock.listFolder.mockResolvedValue({
      folder: { ref: null, name: 'OneDrive', ancestry: [] },
      items: [{ ...sampleItem }],
      nextCursor: null,
    })
    hubApiMock.updateItem.mockRejectedValue(badGateway())

    const { result } = renderHook(
      () => ({
        folder: useFolder('conn-1', null),
        actions: useHubActions(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.folder.status).toBe('ready')
    })

    let failure = null
    await act(async () => {
      try {
        await result.current.actions.renameItem({ connectionId: 'conn-1', ref: 'file-1', name: 'Novo.pdf' })
      } catch (error) {
        failure = error
      }
    })

    expect(failure).toBeInstanceOf(ApiClientError)
    await waitFor(() => {
      expect(hubApiMock.listFolder.mock.calls.length).toBeGreaterThan(1)
    })
    expect(result.current.folder.items.find((item) => item.ref === 'file-1').name).toBe('Relatorio.pdf')
  })

  it('F25 loadMore duplo faz uma chamada e nao duplica', async () => {
    const nextPage = deferred()
    hubApiMock.listFolder.mockImplementation(async (connectionId, folderRef, cursor) => {
      if (!cursor) {
        return { folder: { ref: null, name: 'OneDrive', ancestry: [] }, items: [{ ...sampleItem }], nextCursor: 'c1' }
      }
      return nextPage.promise
    })

    const { result } = renderHook(
      () => ({
        folder: useFolder('conn-1', null),
        actions: useHubActions(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.folder.status).toBe('ready')
    })
    expect(result.current.folder.hasMore).toBe(true)

    let first
    let second
    act(() => {
      first = result.current.folder.loadMore()
      second = result.current.folder.loadMore()
    })
    expect(result.current.folder.isFetchingNextPage).toBe(true)
    const cursorCalls = hubApiMock.listFolder.mock.calls.filter(([, , cursor]) => cursor === 'c1')
    expect(cursorCalls).toHaveLength(1)

    await act(async () => {
      nextPage.resolve({
        folder: { ref: null, name: 'OneDrive', ancestry: [] },
        items: [{ ...sampleItem, ref: 'file-2', name: 'Outro.pdf' }, { ...sampleItem }],
        nextCursor: null,
      })
      await first
      await second
    })

    const refs = result.current.folder.items.map((item) => item.ref)
    expect(refs.filter((ref) => ref === 'file-1')).toHaveLength(1)
    expect(refs).toContain('file-2')
    expect(result.current.folder.hasMore).toBe(false)
    expect(result.current.folder.isFetchingNextPage).toBe(false)
  })

  it('F25 pagina obsoleta apos reload e descartada e falha permite retry', async () => {
    const page2 = deferred()
    const reloaded = deferred()
    let calls = 0
    hubApiMock.listFolder.mockImplementation(async (connectionId, folderRef, cursor) => {
      calls += 1
      if (!cursor) {
        return calls <= 1
          ? { folder: { ref: null, name: 'OneDrive', ancestry: [] }, items: [{ ...sampleItem }], nextCursor: 'c1' }
          : reloaded.promise
      }
      return page2.promise
    })

    const { result } = renderHook(
      () => ({
        folder: useFolder('conn-1', null),
        actions: useHubActions(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.folder.hasMore).toBe(true)
    })

    let pending
    act(() => {
      pending = result.current.folder.loadMore()
      pending.catch(() => {})
    })
    act(() => {
      void result.current.folder.reload()
    })

    await act(async () => {
      page2.resolve({
        folder: { ref: null, name: 'OneDrive', ancestry: [] },
        items: [{ ...sampleItem, ref: 'stale-2', name: 'Obsoleto.pdf' }],
        nextCursor: null,
      })
      await pending
      await Promise.resolve()
    })
    await act(async () => {
      reloaded.resolve({
        folder: { ref: null, name: 'OneDrive', ancestry: [] },
        items: [{ ...sampleItem, ref: 'fresh-1', name: 'Atual.pdf' }],
        nextCursor: 'c2',
      })
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(result.current.folder.items.some((item) => item.ref === 'fresh-1')).toBe(true)
    })
    expect(result.current.folder.items.some((item) => item.ref === 'stale-2')).toBe(false)

    hubApiMock.listFolder.mockImplementation(async (connectionId, folderRef, cursor) => {
      if (!cursor) {
        return { folder: { ref: null, name: 'OneDrive', ancestry: [] }, items: [{ ...sampleItem, ref: 'fresh-1', name: 'Atual.pdf' }], nextCursor: 'c2' }
      }
      throw badRequest('Pagina falhou')
    })

    await act(async () => {
      await result.current.folder.loadMore().catch(() => {})
    })
    expect(result.current.folder.isFetchingNextPage).toBe(false)

    hubApiMock.listFolder.mockImplementation(async (connectionId, folderRef, cursor) => {
      if (!cursor) {
        return { folder: { ref: null, name: 'OneDrive', ancestry: [] }, items: [{ ...sampleItem, ref: 'fresh-1', name: 'Atual.pdf' }], nextCursor: 'c2' }
      }
      return { folder: { ref: null, name: 'OneDrive', ancestry: [] }, items: [{ ...sampleItem, ref: 'file-9', name: 'Nono.pdf' }], nextCursor: null }
    })
    await act(async () => {
      await result.current.folder.loadMore()
    })
    expect(result.current.folder.items.some((item) => item.ref === 'file-9')).toBe(true)
  })

  it('não publica o arquivo recém-aberto como lista de recentes enquanto a lista completa não chega', async () => {
    const older = { ...sampleItem, ref: 'old', name: 'Antigo.pdf', openedAt: '2026-01-01T00:00:00.000Z' }
    const recorded = { ...sampleItem, ref: 'new', name: 'Novo.pdf', openedAt: '2026-09-26T00:00:00.000Z' }
    const pending = []
    hubApiMock.listRecents.mockImplementation(() => {
      const slot = deferred()
      pending.push(slot)
      return slot.promise
    })
    hubApiMock.recordRecent.mockResolvedValue(recorded)

    const { result } = renderHook(
      () => ({
        recents: useRecents(),
        actions: useHubActions(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(pending.length).toBeGreaterThan(0)
    })

    await act(async () => {
      await result.current.actions.recordRecent({ connectionId: 'conn-1', ref: 'new' })
    })

    expect(result.current.recents.status).toBe('loading')
    expect(result.current.recents.entries).toEqual([])

    await waitFor(() => {
      expect(pending.length).toBeGreaterThan(1)
    })

    const stale = [older]
    const fresh = [recorded, older]
    const last = pending.length - 1

    await act(async () => {
      pending.slice(0, last).forEach((slot) => slot.resolve(stale))
      await Promise.all(pending.slice(0, last).map((slot) => slot.promise))
    })
    expect(result.current.recents.status).toBe('loading')
    expect(result.current.recents.entries).toEqual([])

    await act(async () => {
      pending[last].resolve(fresh)
      await pending[last].promise
    })

    await waitFor(() => {
      expect(result.current.recents.status).toBe('ready')
    })
    expect(result.current.recents.entries.map((entry) => entry.ref)).toEqual(['new', 'old'])
  })

  it('mantém os outros recentes ao registrar um arquivo numa lista já sincronizada', async () => {
    const first = { ...sampleItem, ref: 'a', name: 'A.pdf', openedAt: '2026-01-02T00:00:00.000Z' }
    const second = { ...sampleItem, ref: 'b', name: 'B.pdf', openedAt: '2026-01-01T00:00:00.000Z' }
    const opened = { ...second, openedAt: '2026-09-26T00:00:00.000Z' }
    hubApiMock.listRecents.mockResolvedValue([first, second])
    hubApiMock.recordRecent.mockResolvedValue(opened)

    const { result } = renderHook(
      () => ({
        recents: useRecents(),
        actions: useHubActions(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.recents.status).toBe('ready')
    })
    const calls = hubApiMock.listRecents.mock.calls.length

    await act(async () => {
      await result.current.actions.recordRecent({ connectionId: 'conn-1', ref: 'b' })
    })

    expect(result.current.recents.entries.map((entry) => entry.ref)).toEqual(['b', 'a'])
    expect(hubApiMock.listRecents.mock.calls.length).toBe(calls)
  })

  it('signing out drops the previews shown this page session', async () => {
    if (typeof URL.createObjectURL !== 'function') URL.createObjectURL = () => 'blob:preview'
    if (typeof URL.revokeObjectURL !== 'function') URL.revokeObjectURL = () => {}
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:signed-in')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const { result } = renderHook(() => useProviders(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await loadThumbnail('preview', async () => new Blob([Uint8Array.from([1])], { type: 'image/jpeg' }))

    act(() => {
      localStorage.removeItem('bridgit.session')
      window.dispatchEvent(new StorageEvent('storage', { key: 'bridgit.session', newValue: null }))
    })

    await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:signed-in'))
  })
})

describe('several accounts of one provider', () => {
  const second = {
    connectionId: 'conn-2', provider: 'onedrive', providerName: 'OneDrive', account: { email: 'b@outlook.com' },
    generation: 5, operationsEnabled: false,
  }
  const twoAccounts = () => [{ ...oneDriveRow, connections: [oneDriveConnection, second] }]
  const dropboxRow = {
    id: 'dropbox', name: 'Dropbox', configured: true, connected: true,
    connections: [{ connectionId: 'conn-d', provider: 'dropbox', providerName: 'Dropbox', account: { email: 'c@x.com' }, generation: 1, operationsEnabled: false }],
  }
  const listing = (connectionId) => ({
    folder: { ref: null, name: 'Raiz', ancestry: [], connectionId },
    items: [{ ...sampleItem, connectionId, name: `Arquivo de ${connectionId}` }],
    nextCursor: null,
  })

  it('lists the accounts flat, in provider order and oldest first', async () => {
    hubApiMock.listProviders.mockResolvedValue([{ ...twoAccounts()[0] }, dropboxRow])
    const { result } = renderHook(
      () => ({ connections: useConnections(), one: useConnection('conn-2'), none: useConnection('missing'), providers: useProviders() }),
      { wrapper: createWrapper() },
    )
    await waitFor(() => expect(result.current.connections.status).toBe('ready'))
    expect(result.current.connections.connections.map((connection) => connection.connectionId)).toEqual(['conn-1', 'conn-2', 'conn-d'])
    expect(result.current.one.connection).toMatchObject({ connectionId: 'conn-2', provider: 'onedrive', generation: 5 })
    expect(result.current.none.connection).toBeNull()
    expect(result.current.providers.providers[0].connections).toHaveLength(2)
  })

  it('keeps the same ref of two accounts apart in every cache', async () => {
    hubApiMock.listProviders.mockResolvedValue(twoAccounts())
    hubApiMock.listFolder.mockImplementation(async (connectionId) => listing(connectionId))
    const { result } = renderHook(
      () => ({ first: useFolder('conn-1', null), second: useFolder('conn-2', null), item: useItem('conn-2', 'file-1') }),
      { wrapper: createWrapper() },
    )
    await waitFor(() => {
      expect(result.current.first.status).toBe('ready')
      expect(result.current.second.status).toBe('ready')
    })
    expect(result.current.first.items.map((item) => item.name)).toEqual(['Arquivo de conn-1'])
    expect(result.current.second.items.map((item) => item.name)).toEqual(['Arquivo de conn-2'])
    expect(hubApiMock.listFolder).toHaveBeenCalledWith('conn-1', null, null)
    expect(hubApiMock.listFolder).toHaveBeenCalledWith('conn-2', null, null)
    expect(result.current.item.item?.name).toBe('Arquivo de conn-2')
  })

  it('forwards addAccount when connecting another account', async () => {
    hubApiMock.connectProvider.mockResolvedValue({ authorizationUrl: 'about:blank#oauth' })
    const { result } = renderHook(() => useConnections(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(async () => {
      await result.current.connect('onedrive', '/settings', { addAccount: true }).catch(() => {})
    })
    expect(hubApiMock.connectProvider).toHaveBeenCalledWith('onedrive', '/settings', { addAccount: true })
  })

  it('disconnecting a provider purges every one of its accounts and tells the other tabs per account', async () => {
    hubApiMock.listProviders.mockResolvedValue([...twoAccounts(), dropboxRow])
    hubApiMock.listFolder.mockImplementation(async (connectionId) => listing(connectionId))
    hubApiMock.listRecents.mockResolvedValue([
      { ...sampleItem, connectionId: 'conn-1' }, { ...sampleItem, connectionId: 'conn-2' },
      { ...sampleItem, connectionId: 'conn-d', provider: 'dropbox' },
    ])
    hubApiMock.listShortcuts.mockResolvedValue([])
    hubApiMock.listPublicLinks.mockResolvedValue([])
    hubApiMock.disconnectProvider.mockResolvedValue([{ ...oneDriveRow, connected: false, connections: [] }, dropboxRow])
    const { result } = renderHook(
      () => ({ one: useFolder('conn-1', null), two: useFolder('conn-2', null), drop: useFolder('conn-d', null), providers: useProviders(), recents: useRecents() }),
      { wrapper: createWrapper() },
    )
    await waitFor(() => {
      expect(result.current.one.status).toBe('ready')
      expect(result.current.two.status).toBe('ready')
      expect(result.current.drop.status).toBe('ready')
      expect(result.current.providers.status).toBe('ready')
      expect(result.current.recents.entries).toHaveLength(3)
    })
    hubApiMock.listFolder.mockRejectedValue(new ApiClientError('Gone', { code: 'ERRO', status: 400 }))
    hubApiMock.listRecents.mockResolvedValue([{ ...sampleItem, connectionId: 'conn-d', provider: 'dropbox' }])
    broadcastHubEvent.mockClear()

    await act(async () => {
      await result.current.providers.disconnect('onedrive')
    })

    expect(hubApiMock.disconnectProvider).toHaveBeenCalledWith('onedrive')
    await waitFor(() => {
      expect(result.current.one.items).toHaveLength(0)
      expect(result.current.two.items).toHaveLength(0)
    })
    expect(result.current.drop.items).toHaveLength(1)
    const events = broadcastHubEvent.mock.calls.map(([event]) => event).filter((event) => event.scope === 'connection')
    expect(events.map((event) => event.connectionId).sort()).toEqual(['conn-1', 'conn-2'])
  })

  it('disconnecting one account leaves the other account of the provider alone', async () => {
    hubApiMock.listProviders.mockResolvedValue(twoAccounts())
    hubApiMock.listFolder.mockImplementation(async (connectionId) => listing(connectionId))
    hubApiMock.listRecents.mockResolvedValue([])
    hubApiMock.listShortcuts.mockResolvedValue([])
    hubApiMock.listPublicLinks.mockResolvedValue([])
    hubApiMock.disconnectConnection.mockResolvedValue([{ ...oneDriveRow, connections: [second] }])
    const { result } = renderHook(
      () => ({ one: useFolder('conn-1', null), two: useFolder('conn-2', null), connections: useConnections() }),
      { wrapper: createWrapper() },
    )
    await waitFor(() => {
      expect(result.current.one.status).toBe('ready')
      expect(result.current.two.status).toBe('ready')
      expect(result.current.connections.status).toBe('ready')
    })
    hubApiMock.listFolder.mockRejectedValue(new ApiClientError('Gone', { code: 'ERRO', status: 400 }))

    await act(async () => {
      await result.current.connections.disconnect('conn-1')
    })

    expect(hubApiMock.disconnectConnection).toHaveBeenCalledWith('conn-1')
    expect(hubApiMock.disconnectProvider).not.toHaveBeenCalled()
    expect(result.current.one.items).toHaveLength(0)
    expect(result.current.two.items).toHaveLength(1)
    expect(result.current.connections.connections.map((connection) => connection.connectionId)).toEqual(['conn-2'])
  })

  it('a reload purges only the accounts that left or came back under a new generation', async () => {
    const third = { ...second, connectionId: 'conn-3', generation: 1 }
    hubApiMock.listProviders.mockResolvedValue([{ ...oneDriveRow, connections: [oneDriveConnection, second, third] }])
    hubApiMock.listFolder.mockImplementation(async (connectionId) => listing(connectionId))
    const { result } = renderHook(
      () => ({ one: useFolder('conn-1', null), two: useFolder('conn-2', null), three: useFolder('conn-3', null), connections: useConnections() }),
      { wrapper: createWrapper() },
    )
    await waitFor(() => {
      expect(result.current.one.status).toBe('ready')
      expect(result.current.two.status).toBe('ready')
      expect(result.current.three.status).toBe('ready')
    })
    hubApiMock.listFolder.mockRejectedValue(new ApiClientError('Gone', { code: 'ERRO', status: 400 }))
    // conn-1 is gone, conn-2 was reconnected (new generation), conn-3 is untouched.
    hubApiMock.listProviders.mockResolvedValue([{ ...oneDriveRow, connections: [{ ...second, generation: 6 }, third] }])

    await act(async () => {
      await result.current.connections.reload({ force: true })
    })

    expect(result.current.one.items).toHaveLength(0)
    expect(result.current.two.items).toHaveLength(0)
    expect(result.current.three.items).toHaveLength(1)
  })

  it('names the real provider on the read descriptor, whatever the connection is called', async () => {
    hubApiMock.listProviders.mockResolvedValue(twoAccounts())
    hubApiMock.getReadSource.mockResolvedValue({
      mode: 'pdf', url: '/t', revision: 'r-1', connectionId: 'conn-2', generation: 5,
      authorizedUntil: new Date(Date.now() + 60_000).toISOString(), expiresAt: new Date(Date.now() + 300_000).toISOString(),
    })
    const { result } = renderHook(() => ({ connections: useConnections(), actions: useHubActions() }), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.connections.status).toBe('ready'))
    let descriptor
    await act(async () => {
      descriptor = await result.current.actions.getReadSource({ connectionId: 'conn-2', ref: 'file-1' })
    })
    expect(hubApiMock.getReadSource).toHaveBeenCalledWith('conn-2', 'file-1')
    expect(descriptor).toMatchObject({ connectionId: 'conn-2', provider: 'onedrive', providerId: 'onedrive' })
  })

  it('fetches the account picture by connection and generation', async () => {
    const blob = new Blob(['x'])
    hubApiMock.getConnectionAvatar.mockResolvedValue(blob)
    const { result } = renderHook(() => useHubActions(), { wrapper: createWrapper() })
    await expect(result.current.getConnectionAvatar('conn-2', 5)).resolves.toBe(blob)
    expect(hubApiMock.getConnectionAvatar).toHaveBeenCalledWith('conn-2', 5)
  })

  it('shortcuts stay per account', async () => {
    hubApiMock.listProviders.mockResolvedValue(twoAccounts())
    hubApiMock.listShortcuts.mockResolvedValue([{ ...sampleItem, connectionId: 'conn-1' }])
    const { result } = renderHook(() => useShortcuts(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.isShortcut('conn-1', 'file-1')).toBe(true)
    expect(result.current.isShortcut('conn-2', 'file-1')).toBe(false)
  })
})
