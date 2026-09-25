import { act, renderHook, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError } from '@bridgit/shared-client'
import { SessionProvider } from '../auth/SessionContext.jsx'
import { HubDataProvider } from './HubDataProvider.jsx'
import { useFolder, useHubActions, useSearch } from './hooks.js'
import { createHubApi } from './hubApi.js'
import { clearBrowserCookies } from '../../test/setup.js'

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
          session: { id: 'session-1', persistent: true },
        }
      }
      throw new Error(`Unexpected apiRequest path: ${path}`)
    }),
  }
})

const sampleItem = {
  ref: 'file-1',
  provider: 'onedrive',
  name: 'Relatorio.pdf',
  kind: 'file',
  mimeType: 'application/pdf',
  extension: 'pdf',
  size: 1200,
  modifiedAt: '2026-01-01T00:00:00.000Z',
  parentRef: null,
}

const hubApiMock = {
  listProviders: vi.fn().mockResolvedValue([]),
  connectProvider: vi.fn(),
  disconnectProvider: vi.fn(),
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
      session: { id: 'session-1', persistent: true },
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
  clearBrowserCookies()
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
  it('reverte rename otimista quando a API falha', async () => {
    hubApiMock.listFolder.mockResolvedValue({
      folder: { ref: null, name: 'OneDrive', ancestry: [] },
      items: [sampleItem],
      nextCursor: null,
    })
    hubApiMock.updateItem.mockRejectedValue(new ApiClientError('Falhou', { code: 'ERRO', status: 500 }))

    const { result } = renderHook(
      () => ({
        folder: useFolder('onedrive', null),
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
          providerId: 'onedrive',
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
    hubApiMock.deleteItem.mockRejectedValue(new ApiClientError('Falhou', { code: 'ERRO', status: 500 }))

    const { result } = renderHook(
      () => ({
        folder: useFolder('onedrive', null),
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
          providerId: 'onedrive',
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
        folder: useFolder('onedrive', null),
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
        providerId: 'onedrive',
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
