import { act, renderHook, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionProvider } from '../auth/SessionContext.jsx'
import OperationNotices from '../components/OperationNotices/OperationNotices.jsx'
import { HubDataProvider } from './HubDataProvider.jsx'
import { useFolder, useHubActions, useItem, useProviders } from './hooks.js'
import { createHubApi } from './hubApi.js'

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
          session: { id: 'session-1', persistent: true, expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), clientKind: 'web' },
        }
      }
      throw new Error(`Unexpected apiRequest path: ${path}`)
    }),
  }
})

const connection = {
  connectionId: 'conn-1', provider: 'onedrive', providerName: 'OneDrive', account: { email: 'a@outlook.com' },
  generation: 1, operationsEnabled: true,
}
const providerRow = { id: 'onedrive', name: 'OneDrive', configured: true, connected: true, connections: [connection] }
const note = {
  ref: 'file-1', connectionId: 'conn-1', provider: 'onedrive', name: 'notas.txt', kind: 'file', mimeType: 'text/plain',
  extension: 'txt', size: 10, modifiedAt: '2026-01-01T00:00:00.000Z', remoteVersion: 'v1', contentRevision: 'r1', parentRef: null,
}
const other = { ...note, ref: 'file-2', name: 'outro.txt' }

const hubApiMock = {
  listProviders: vi.fn(),
  listFolder: vi.fn(),
  getItem: vi.fn(),
  getReadSource: vi.fn(),
  replaceFileContent: vi.fn(),
}

function wrapperWithNotices({ children }) {
  return (
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SessionProvider>
        <HubDataProvider>
          {children}
          <OperationNotices />
        </HubDataProvider>
      </SessionProvider>
    </MemoryRouter>
  )
}

function hubOptions() {
  return createHubApi.mock.calls.at(-1)[2]
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem('bridgit.session', JSON.stringify({
    accessToken: 'test-token',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    user: { id: 'user-1', username: 'arthur' },
    session: { id: 'session-1', persistent: true, expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), clientKind: 'web' },
  }))
  Object.values(hubApiMock).forEach((fn) => fn.mockReset())
  hubApiMock.listProviders.mockResolvedValue([providerRow])
  hubApiMock.listFolder.mockResolvedValue({ folder: { ref: null, name: 'OneDrive', ancestry: [] }, items: [other, note], nextCursor: null })
  hubApiMock.getItem.mockResolvedValue(note)
  createHubApi.mockReturnValue(hubApiMock)
})

async function renderHub() {
  const view = renderHook(() => ({
    providers: useProviders(), folder: useFolder('conn-1', null), item: useItem('conn-1', 'file-1'), actions: useHubActions(),
  }), { wrapper: wrapperWithNotices })
  await waitFor(() => {
    expect(view.result.current.providers.status).toBe('ready')
    expect(view.result.current.folder.items).toHaveLength(2)
    expect(view.result.current.item.status).toBe('ready')
  })
  return view
}

const text = (content = 'novo texto') => new File([content], 'notas.txt', { type: 'text/plain' })

describe('saveFileContent', () => {
  it('patches size, dates and revisions in place without moving or renaming the item', async () => {
    const { result } = await renderHub()
    const saved = {
      ...note, size: 99, modifiedAt: '2026-02-02T00:00:00.000Z', remoteVersion: 'v2', contentRevision: 'r2',
      name: 'nao-muda.txt', parentRef: 'outra-pasta',
    }
    hubApiMock.replaceFileContent.mockResolvedValue(saved)
    let outcome
    await act(async () => {
      outcome = await result.current.actions.saveFileContent({ connectionId: 'conn-1', ref: 'file-1', file: text(), baseRevision: 'r1' })
    })
    expect(hubApiMock.replaceFileContent).toHaveBeenCalledWith('conn-1', 'file-1', expect.any(File), 'r1', expect.any(Object))
    expect(outcome).toEqual({ item: saved, revision: 'r2' })
    expect(result.current.folder.items.map((item) => item.ref)).toEqual(['file-2', 'file-1'])
    expect(result.current.folder.items[1]).toMatchObject({
      name: 'notas.txt', parentRef: null, size: 99, modifiedAt: '2026-02-02T00:00:00.000Z', remoteVersion: 'v2', contentRevision: 'r2',
    })
    expect(result.current.folder.items[0]).toMatchObject({ size: 10, contentRevision: 'r1' })
    expect(result.current.item.item).toMatchObject({ name: 'notas.txt', size: 99, remoteVersion: 'v2', contentRevision: 'r2' })
  })

  it('drops the cached read descriptor so the next read sees the new revision', async () => {
    const { result } = await renderHub()
    let sequence = 0
    hubApiMock.getReadSource.mockImplementation(async () => {
      sequence += 1
      return {
        url: `/ticket-${sequence}`, revision: sequence === 1 ? 'r1' : 'r2',
        authorizedUntil: new Date(Date.now() + 60_000).toISOString(), expiresAt: new Date(Date.now() + 300_000).toISOString(),
      }
    })
    hubApiMock.replaceFileContent.mockResolvedValue({ ...note, contentRevision: 'r2', remoteVersion: 'v2' })
    let first
    let again
    await act(async () => {
      first = await result.current.actions.getReadSource({ connectionId: 'conn-1', ref: 'file-1' })
      await result.current.actions.saveFileContent({ connectionId: 'conn-1', ref: 'file-1', file: text(), baseRevision: 'r1' })
      again = await result.current.actions.getReadSource({ connectionId: 'conn-1', ref: 'file-1' })
    })
    expect(first.url).toBe('/ticket-1')
    expect(again.url).not.toBe('/ticket-1')
  })

  it('reads the cloud revision with refresh and submits it when overwriting', async () => {
    const { result } = await renderHub()
    hubApiMock.getReadSource.mockResolvedValue({ url: '/t', revision: 'r-cloud', authorizedUntil: new Date(Date.now() + 60_000).toISOString() })
    hubApiMock.replaceFileContent.mockResolvedValue({ ...note, contentRevision: 'r-next' })
    await act(async () => {
      await result.current.actions.saveFileContent({ connectionId: 'conn-1', ref: 'file-1', file: text(), baseRevision: 'r1', overwrite: true })
    })
    expect(hubApiMock.getReadSource).toHaveBeenCalledWith('conn-1', 'file-1', true)
    expect(hubApiMock.replaceFileContent.mock.calls[0][3]).toBe('r-cloud')
  })

  it('refuses with EDICAO_INDISPONIVEL when there is no revision to save against', async () => {
    const { result } = await renderHub()
    await act(async () => {
      await expect(result.current.actions.saveFileContent({ connectionId: 'conn-1', ref: 'file-1', file: text(), baseRevision: '' }))
        .rejects.toMatchObject({ code: 'EDICAO_INDISPONIVEL', status: 409 })
    })
    expect(hubApiMock.replaceFileContent).not.toHaveBeenCalled()
  })

  it('throws for text over 2 MB before any request', async () => {
    const { result } = await renderHub()
    const big = text()
    Object.defineProperty(big, 'size', { value: 2 * 1024 * 1024 + 1 })
    await act(async () => {
      await expect(result.current.actions.saveFileContent({ connectionId: 'conn-1', ref: 'file-1', file: big, baseRevision: 'r1', overwrite: true }))
        .rejects.toMatchObject({ code: 'TEXTO_GRANDE_DEMAIS', status: 400 })
    })
    expect(hubApiMock.replaceFileContent).not.toHaveBeenCalled()
    expect(hubApiMock.getReadSource).not.toHaveBeenCalled()
  })

  it('does not adopt an older save that is still being verified, nor report its error', async () => {
    const { result } = await renderHub()
    const request = (kind) => ({ clientKey: `k-${kind}`, kind, connectionId: 'conn-1', generation: 1, ref: 'file-1', name: kind === 'UPDATE' ? 'a' : undefined })
    act(() => {
      hubOptions().onOperation({ id: 'op-save', status: 'NEEDS_ATTENTION', request: request('REPLACE_CONTENT'), errorMessage: 'Sem rede.', updatedAt: '2026-03-01T10:00:00.000Z' })
    })
    expect(hubOptions().getUncertainOperation('conn-1', 'REPLACE_CONTENT', { ref: 'file-1' })).toBeUndefined()
    expect(result.current.actions.getOperationError('conn-1')).toBeNull()

    // The same lookup still finds other kinds, so the exclusion is specific to saves.
    act(() => {
      hubOptions().onOperation({ id: 'op-rename', status: 'VERIFYING', request: request('UPDATE'), errorMessage: 'Verificando.', updatedAt: '2026-03-01T10:00:01.000Z' })
    })
    expect(hubOptions().getUncertainOperation('conn-1', 'UPDATE', { ref: 'file-1', name: 'a' })).toMatchObject({ id: 'op-rename' })
  })
})

describe('attended saves and notices', () => {
  // Plays the hub API: announces the request, goes through EXECUTING, then the cloud refuses it.
  function refuseAfterAccepted() {
    let refuse
    hubApiMock.replaceFileContent.mockImplementation(async (connectionId, ref, file, expected, hooks) => {
      const request = { clientKey: 'save-1', kind: 'REPLACE_CONTENT', connectionId, generation: 1, ref, expectedVersion: expected }
      hooks.onRequest(request)
      hubOptions().onIntent(request, file)
      hubOptions().onOperation({ id: 'op-1', status: 'EXECUTING', request, updatedAt: '2026-03-01T10:00:00.000Z' })
      await new Promise((resolve) => { refuse = resolve })
      hubOptions().onOperation({ id: 'op-1', status: 'REJECTED', request, errorMessage: 'O arquivo está bloqueado.', updatedAt: '2026-03-01T10:00:05.000Z' })
      throw Object.assign(new Error('bloqueado'), { code: 'ARQUIVO_BLOQUEADO', status: 423 })
    })
    return () => refuse()
  }

  async function runRefusedSave(isAttended) {
    const { result } = await renderHub()
    const refuse = refuseAfterAccepted()
    let failure
    let pending
    await act(async () => {
      pending = result.current.actions.saveFileContent({ connectionId: 'conn-1', ref: 'file-1', file: text(), baseRevision: 'r1', isAttended })
        .catch((error) => { failure = error })
      await Promise.resolve()
    })
    await act(async () => { refuse(); await pending })
    expect(failure).toMatchObject({ code: 'ARQUIVO_BLOQUEADO' })
  }

  it('does not toast a refusal the open editor already shows', async () => {
    await runRefusedSave(() => true)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('toasts the refusal, naming the file, once the editor is gone', async () => {
    await runRefusedSave(() => false)
    expect(await screen.findByText(/Não foi possível salvar "notas.txt"\. O arquivo está bloqueado\./)).toBeTruthy()
  })

  it('names the file from the catalog when a refusal listed by the server carries no name', async () => {
    await renderHub()
    const request = { clientKey: 'save-2', kind: 'REPLACE_CONTENT', name: null, connectionId: 'conn-1', generation: 1, ref: 'file-1' }
    act(() => { hubOptions().onOperation({ id: 'op-2', status: 'EXECUTING', request, updatedAt: '2026-03-01T10:00:00.000Z' }) })
    act(() => { hubOptions().onOperation({ id: 'op-2', status: 'REJECTED', request, errorMessage: 'Bloqueado.', updatedAt: '2026-03-01T10:00:05.000Z' }) })
    expect(await screen.findByText('Não foi possível salvar "notas.txt". Bloqueado.')).toBeTruthy()
  })
})
