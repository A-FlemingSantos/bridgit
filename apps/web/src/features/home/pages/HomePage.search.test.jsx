import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HomePage from './HomePage.jsx'
import { hubErrorMessage } from '../../../shared/state/hubErrorMessage.js'

vi.mock('../../../shared/hub/index.js', () => ({
  useHubActions: vi.fn(),
  useProviders: vi.fn(),
  useRecents: vi.fn(),
  useSearch: vi.fn(),
  useShortcuts: vi.fn(),
}))

vi.mock('../../../shared/state/HubState.jsx', () => ({
  useHub: () => ({ openOverlay: vi.fn() }),
}))

import {
  useHubActions,
  useProviders,
  useRecents,
  useSearch,
  useShortcuts,
} from '../../../shared/hub/index.js'

const router = { future: { v7_startTransition: true, v7_relativeSplatPath: true } }

const fileItem = {
  provider: 'onedrive',
  ref: 'file-1',
  name: 'Relatório.pdf',
  kind: 'file',
  uiKey: 'onedrive-file-1',
}

function setup(searchValue) {
  useHubActions.mockReturnValue({ uploadFiles: vi.fn().mockResolvedValue([]) })
  useProviders.mockReturnValue({ providers: [], status: 'ready' })
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
    useProviders.mockReturnValue({
      providers: [{ id: 'onedrive', name: 'OneDrive', connected: true }],
      status: 'ready',
    })
    useRecents.mockReturnValue({ status: 'ready', entries: [], error: null })
    useShortcuts.mockReturnValue({ status: 'ready', entries: [], error: null, isShortcut: () => false })
    useSearch.mockReturnValue({ status: 'idle', results: [], providers: [], error: null })
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Enviar' }))
    await user.click(screen.getByRole('menuitem', { name: 'OneDrive' }))
    await user.upload(document.querySelector('input[type="file"]'), [okFile, badFile])

    expect(await screen.findByRole('alert')).toHaveTextContent('1 de 2 enviados')
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

    await waitFor(() => {
      expect(uploadFiles).toHaveBeenCalledTimes(2)
    })
    expect(uploadFiles.mock.calls[1][0].files).toEqual([badFile])
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
        { id: 'onedrive', ok: true, error: null },
        { id: 'google-drive', ok: true, error: null },
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
        { id: 'onedrive', ok: true, error: null },
        { id: 'dropbox', ok: false, error: 'PROVEDOR_FALHOU' },
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
        { id: 'onedrive', ok: true, error: null },
        { id: 'dropbox', ok: false, error: null },
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
        { id: 'onedrive', ok: false, error: null },
        { id: 'dropbox', ok: false, error: null },
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
