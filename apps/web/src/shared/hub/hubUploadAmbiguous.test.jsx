import { act, renderHook, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError } from '@bridgit/shared-client'
import { SessionProvider } from '../auth/SessionContext.jsx'
import { HubDataProvider } from './HubDataProvider.jsx'
import { useFolder, useHubActions } from './hooks.js'
import { HubUploadError } from './hubErrors.js'
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
    if (typeof mockFn.mockReset === 'function') mockFn.mockReset()
  })
  hubApiMock.listProviders.mockResolvedValue([])
  createHubApi.mockReturnValue(hubApiMock)
})

describe('upload ambiguous flag', () => {
  it('marca 4xx como explícito e 5xx/rede como ambíguo', async () => {
    hubApiMock.listFolder.mockResolvedValue({
      folder: { ref: null, name: 'OneDrive', ancestry: [] },
      items: [],
      nextCursor: null,
    })
    hubApiMock.uploadFile.mockImplementation(async (providerId, parentRef, file) => {
      if (file.name === 'rejeitado.txt') {
        throw new ApiClientError('Rejeitado', { code: 'ERRO', status: 400 })
      }
      throw new ApiClientError('Indisponível', { code: 'ERRO', status: 502 })
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

    let failure = null
    await act(async () => {
      try {
        await result.current.actions.uploadFiles({
          providerId: 'onedrive',
          parentRef: null,
          files: [
            new File(['a'], 'rejeitado.txt', { type: 'text/plain' }),
            new File(['b'], 'duvidoso.txt', { type: 'text/plain' }),
          ],
        })
      } catch (error) {
        failure = error
      }
    })

    expect(failure).toBeInstanceOf(HubUploadError)
    expect(failure.failed).toHaveLength(2)
    expect(failure.failed.find((entry) => entry.file.name === 'rejeitado.txt').ambiguous).toBe(false)
    expect(failure.failed.find((entry) => entry.file.name === 'duvidoso.txt').ambiguous).toBe(true)
    expect(failure.message).toContain('Falhou: rejeitado.txt.')
    expect(failure.message).toContain('Verificando: duvidoso.txt.')
  })
})
