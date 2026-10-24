import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HomePage from './HomePage.jsx'
import { hubErrorMessage } from '../../../shared/state/hubErrorMessage.js'

vi.mock('../../../shared/hub/index.js', () => ({
  useConnections: vi.fn(),
  useHubActions: vi.fn(),
  // The sidebar beside the page reads the provider rows.
  useProviders: vi.fn(() => ({ providers: [], status: 'ready' })),
  usePublicLinks: vi.fn(() => ({ status: 'ready', entries: [], error: null })),
  useRecents: vi.fn(),
  useSearch: vi.fn(),
  useShortcuts: vi.fn(),
}))

vi.mock('../../../shared/state/HubState.jsx', () => ({
  useHub: () => ({ openOverlay: vi.fn() }),
}))

vi.mock('../../../shared/auth/SessionContext.jsx', () => ({
  useSession: () => ({ user: { id: 'user-1', username: 'arthur' } }),
}))

import {
  useConnections,
  useHubActions,
  useRecents,
  useSearch,
  useShortcuts,
} from '../../../shared/hub/index.js'

const router = { future: { v7_startTransition: true, v7_relativeSplatPath: true } }

const CONNECTIONS = [
  { connectionId: 'conn-od', provider: 'onedrive', providerName: 'OneDrive', account: { email: 'ana@mail.com' } },
  { connectionId: 'conn-db', provider: 'dropbox', providerName: 'Dropbox', account: { email: 'ana@mail.com' } },
]

const fileItem = {
  provider: 'onedrive',
  connectionId: 'conn-od',
  ref: 'file-1',
  name: 'Relatório.pdf',
  kind: 'file',
  uiKey: 'onedrive-file-1',
}

function setup(searchValue) {
  useHubActions.mockReturnValue({ uploadFiles: vi.fn().mockResolvedValue([]) })
  useConnections.mockReturnValue({ connections: CONNECTIONS, status: 'ready' })
  useRecents.mockReturnValue({ status: 'ready', entries: [], error: null })
  useShortcuts.mockReturnValue({ status: 'ready', entries: [], error: null, isShortcut: () => false })
  useSearch.mockReturnValue(searchValue)
}

function renderPage() {
  return render(
    <MemoryRouter {...router} initialEntries={['/home']}>
      <HomePage />
    </MemoryRouter>,
  )
}

async function typeQuery(user, text) {
  await user.type(screen.getByRole('searchbox', { name: 'Buscar' }), text)
}

describe('HomePage upload parcial', () => {
  it('oferece nova tentativa só com os arquivos que falharam', async () => {
    const user = userEvent.setup()
    const okFile = new File(['ok'], 'ok.txt', { type: 'text/plain' })
    const badFile = new File(['ruim'], 'falha.txt', { type: 'text/plain' })
    const uploadError = Object.assign(new Error('1 de 2 enviados'), {
      name: 'HubUploadError',
      uploaded: [{ ref: 'ok-1' }],
      failed: [{ file: badFile, error: new Error('rede') }],
    })
    const uploadFiles = vi.fn().mockRejectedValueOnce(uploadError).mockResolvedValueOnce([])
    useHubActions.mockReturnValue({ uploadFiles })
    useConnections.mockReturnValue({ connections: [CONNECTIONS[0]], status: 'ready' })
    useRecents.mockReturnValue({ status: 'ready', entries: [], error: null })
    useShortcuts.mockReturnValue({ status: 'ready', entries: [], error: null, isShortcut: () => false })
    useSearch.mockReturnValue({ status: 'idle', results: [], providers: [], error: null })
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Enviar' }))
    await user.click(screen.getByRole('menuitem', { name: 'Enviar arquivos' }))
    await user.upload(document.querySelector('input[type="file"]:not([webkitdirectory])'), [okFile, badFile])

    expect(await screen.findByRole('alert')).toHaveTextContent('1 de 2 enviados')
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

    await waitFor(() => {
      expect(uploadFiles).toHaveBeenCalledTimes(2)
    })
    expect(uploadFiles.mock.calls[1][0].files).toEqual([badFile])
    expect(uploadFiles.mock.calls[1][0].connectionId).toBe('conn-od')
  })
})
  beforeEach(() => {
    vi.clearAllMocks()
  })

describe('HomePage busca por provedor', () => {
  it('mostra "Nada encontrado." quando todos retornam vazio', async () => {
    const user = userEvent.setup()
    setup({
      status: 'ready',
      results: [],
      providers: [
        { id: 'onedrive', connectionId: 'conn-od', ok: true, error: null },
        { id: 'google-drive', connectionId: 'conn-gd', ok: true, error: null },
      ],
      error: null,
    })
    renderPage()
    await typeQuery(user, 'rel')
    expect(await screen.findByText('Nada encontrado.')).toBeInTheDocument()
    expect(screen.queryByText('Nenhum resultado')).not.toBeInTheDocument()
  })

  it('mostra parcial quando um provedor falha e outro encontra', async () => {
    const user = userEvent.setup()
    setup({
      status: 'ready',
      results: [fileItem],
      providers: [
        { id: 'onedrive', connectionId: 'conn-od', ok: true, error: null },
        { id: 'dropbox', connectionId: 'conn-db', ok: false, error: 'PROVEDOR_FALHOU' },
      ],
      error: null,
    })
    renderPage()
    await typeQuery(user, 'rel')
    expect(await screen.findByText('Relatório.pdf')).toBeInTheDocument()
    expect(screen.getByText(/parciais/)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível buscar em Dropbox.')
    expect(screen.getByRole('alert')).not.toHaveTextContent('PROVEDOR_FALHOU')
    expect(screen.queryByText('Nada encontrado.')).not.toBeInTheDocument()
  })

  it('mostra vazio e erro lado a lado', async () => {
    const user = userEvent.setup()
    setup({
      status: 'ready',
      results: [],
      providers: [
        { id: 'onedrive', connectionId: 'conn-od', ok: true, error: null },
        { id: 'dropbox', connectionId: 'conn-db', ok: false, error: null },
      ],
      error: null,
    })
    renderPage()
    await typeQuery(user, 'rel')
    expect(await screen.findByText('Nenhum resultado')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível buscar em Dropbox')
    expect(screen.queryByText('Nada encontrado.')).not.toBeInTheDocument()
  })

  it('mostra falha total com nova tentativa', async () => {
    const user = userEvent.setup()
    setup({
      status: 'ready',
      results: [],
      providers: [
        { id: 'onedrive', connectionId: 'conn-od', ok: false, error: null },
        { id: 'dropbox', connectionId: 'conn-db', ok: false, error: null },
      ],
      error: null,
    })
    renderPage()
    await typeQuery(user, 'rel')
    expect(await screen.findByText('Não foi possível buscar.')).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: 'Tentar novamente' })
    await user.click(retry)
    await waitFor(() => {
      expect(screen.getByRole('searchbox', { name: 'Buscar' })).toHaveValue('rel')
    })
    expect(hubErrorMessage).toBeDefined()
  })
})

describe('HomePage busca com mais de uma conta do mesmo provedor', () => {
  const second = { ...fileItem, connectionId: 'conn-od-2', ref: 'file-2', name: 'Outro.pdf', uiKey: 'conn-od-2-file-2' }

  function setupTwoAccounts(results, providers) {
    setup({ status: 'ready', results, providers, error: null })
    useConnections.mockReturnValue({
      connections: [
        CONNECTIONS[0],
        { connectionId: 'conn-od-2', provider: 'onedrive', providerName: 'OneDrive', account: { email: 'bia@mail.com' } },
        CONNECTIONS[1],
      ],
      status: 'ready',
    })
  }

  it('separa os resultados por conta e identifica cada uma pelo e-mail', async () => {
    const user = userEvent.setup()
    setupTwoAccounts([fileItem, second], [
      { id: 'onedrive', connectionId: 'conn-od', ok: true, error: null },
      { id: 'onedrive', connectionId: 'conn-od-2', ok: true, error: null },
      { id: 'dropbox', connectionId: 'conn-db', ok: true, error: null },
    ])
    renderPage()
    await typeQuery(user, 'rel')

    expect(await screen.findByRole('heading', { level: 3, name: 'OneDrive · ana@mail.com' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'OneDrive · bia@mail.com' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Dropbox' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Relatório.pdf' })).toHaveAttribute('href', '/drives/conn-od/file/file-1')
    expect(screen.getByRole('link', { name: 'Outro.pdf' })).toHaveAttribute('href', '/drives/conn-od-2/file/file-2')
  })

  it('uma conta que falha não esconde os resultados da outra do mesmo provedor', async () => {
    const user = userEvent.setup()
    setupTwoAccounts([fileItem], [
      { id: 'onedrive', connectionId: 'conn-od', ok: true, error: null },
      { id: 'onedrive', connectionId: 'conn-od-2', ok: false, error: 'PROVEDOR_FALHOU' },
    ])
    renderPage()
    await typeQuery(user, 'rel')

    expect(await screen.findByText('Relatório.pdf')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível buscar em OneDrive · bia@mail.com.')
  })
})
