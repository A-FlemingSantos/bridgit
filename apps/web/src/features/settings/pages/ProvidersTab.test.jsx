import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProvidersTab from './ProvidersTab.jsx'

vi.mock('../../../shared/hub/hooks.js', () => ({
  useConnections: vi.fn(),
  useProviders: vi.fn(),
}))

vi.mock('../../../shared/components/AccountAvatar/AccountAvatar.jsx', () => ({
  default: ({ connection }) => <span data-testid="avatar">{connection.connectionId}</span>,
}))

import { useConnections, useProviders } from '../../../shared/hub/hooks.js'

const router = { future: { v7_startTransition: true, v7_relativeSplatPath: true } }

const connections = [
  {
    connectionId: 'c-od',
    provider: 'onedrive',
    providerName: 'OneDrive',
    account: { email: 'arthur@outlook.com', name: 'Arthur' },
    lastError: null,
    generation: 1,
  },
  {
    connectionId: 'c-gd-1',
    provider: 'google-drive',
    providerName: 'Google Drive',
    account: { email: 'arthur@gmail.com', name: 'Arthur' },
    lastError: null,
    generation: 1,
  },
  {
    connectionId: 'c-gd-2',
    provider: 'google-drive',
    providerName: 'Google Drive',
    account: { email: 'outra@gmail.com', name: 'Outra' },
    lastError: null,
    generation: 1,
  },
]

const providers = [
  { id: 'onedrive', name: 'OneDrive', configured: true },
  { id: 'google-drive', name: 'Google Drive', configured: true },
  { id: 'dropbox', name: 'Dropbox', configured: true },
]

function setup({ items = connections, connect = vi.fn(), disconnect = vi.fn() } = {}) {
  useConnections.mockReturnValue({ status: 'ready', connections: items, error: null, connect, disconnect })
  useProviders.mockReturnValue({ status: 'ready', providers, error: null, connect, disconnect: vi.fn() })
  return { connect, disconnect }
}

function renderTab(entry = '/settings/providers') {
  let lastLocation = null
  function LocationProbe() {
    lastLocation = useLocation()
    return null
  }
  render(
    <MemoryRouter {...router} initialEntries={[entry]}>
      <ProvidersTab />
      <LocationProbe />
    </MemoryRouter>,
  )
  return () => lastLocation
}

describe('ProvidersTab lista de contas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mostra "Minhas contas" com cada conta (avatar e e-mail) e o botão de adicionar no fim', () => {
    setup()
    renderTab()

    expect(screen.getByRole('heading', { name: 'Minhas contas' })).toBeInTheDocument()
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(within(items[0]).getByText('arthur@outlook.com')).toBeInTheDocument()
    expect(within(items[0]).getByTestId('avatar')).toHaveTextContent('c-od')
    expect(within(items[1]).getByText('arthur@gmail.com')).toBeInTheDocument()
    expect(within(items[2]).getByText('outra@gmail.com')).toBeInTheDocument()
    expect(within(items[3]).getByRole('button', { name: 'Adicionar conta' })).toBeEnabled()
    expect(screen.getAllByRole('button', { name: /^Sair de / })).toHaveLength(3)
  })

  it('sair pede confirmação e desconecta só aquela conta', async () => {
    const user = userEvent.setup()
    const { disconnect } = setup({ disconnect: vi.fn().mockResolvedValue(undefined) })
    renderTab()

    await user.click(screen.getByRole('button', { name: 'Sair de outra@gmail.com' }))
    expect(screen.getByText('Sair desta conta? Os arquivos continuam no provedor.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sair' }))

    await waitFor(() => expect(disconnect).toHaveBeenCalledWith('c-gd-2'))
    expect(disconnect).toHaveBeenCalledTimes(1)
  })

  it('cancelar a saída não desconecta', async () => {
    const user = userEvent.setup()
    const { disconnect } = setup()
    renderTab()

    await user.click(screen.getByRole('button', { name: 'Sair de arthur@outlook.com' }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByText('Sair desta conta? Os arquivos continuam no provedor.')).not.toBeInTheDocument()
    expect(disconnect).not.toHaveBeenCalled()
  })

  it('mantém a confirmação aberta e mostra o erro quando sair falha', async () => {
    const user = userEvent.setup()
    const disconnect = vi.fn()
      .mockRejectedValueOnce(new Error('falha ao sair'))
      .mockResolvedValueOnce(undefined)
    setup({ disconnect })
    renderTab()

    await user.click(screen.getByRole('button', { name: 'Sair de arthur@outlook.com' }))
    await user.click(screen.getByRole('button', { name: 'Sair' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('falha ao sair')
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sair' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('conta com acesso expirado mostra o aviso e reconecta pelo provedor dela', async () => {
    const user = userEvent.setup()
    const { connect } = setup({
      items: [{ ...connections[0], lastError: 'RECONEXAO_NECESSARIA' }],
      connect: vi.fn().mockResolvedValue(undefined),
    })
    renderTab()

    expect(screen.getByText('Acesso expirado')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reconectar' }))
    expect(connect).toHaveBeenCalledWith('onedrive', expect.any(String))
  })

  it('adicionar conta abre os provedores e conecta com addAccount', async () => {
    const user = userEvent.setup()
    const { connect } = setup({ connect: vi.fn().mockResolvedValue(undefined) })
    renderTab()

    await user.click(screen.getByRole('button', { name: 'Adicionar conta' }))
    await user.click(await screen.findByRole('menuitem', { name: /Dropbox/ }))
    expect(connect).toHaveBeenCalledWith('dropbox', expect.any(String), { addAccount: true })
  })

  it('sem contas mostra só o botão de adicionar', () => {
    setup({ items: [] })
    renderTab()

    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Adicionar conta' })).toBeInTheDocument()
  })
})

describe('ProvidersTab aviso de retorno do OAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mostra o aviso uma vez, limpa a URL e permite dispensar', async () => {
    const user = userEvent.setup()
    setup()
    const location = renderTab('/settings/providers?provider=onedrive&status=connected&background=%2Fhome')

    expect(await screen.findByText('OneDrive conectado')).toBeInTheDocument()
    await waitFor(() => expect(location().search).toBe(''))
    expect(location().state).toEqual({ backgroundLocation: expect.objectContaining({ pathname: '/home' }) })

    await user.click(screen.getByRole('button', { name: 'Dispensar' }))
    expect(screen.queryByText('OneDrive conectado')).not.toBeInTheDocument()
  })

  it('some sozinho depois de um tempo quando a conexão deu certo', async () => {
    vi.useFakeTimers()
    setup()
    renderTab('/settings/providers?provider=onedrive&status=connected')

    expect(screen.getByText('OneDrive conectado')).toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(6500) })
    expect(screen.queryByText('OneDrive conectado')).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  it('traduz OAUTH_CODE_AUSENTE', async () => {
    setup()
    renderTab('/settings/providers?provider=dropbox&status=error&error=OAUTH_CODE_AUSENTE')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O provedor não devolveu a autorização. Tente conectar de novo.',
    )
  })

  it('traduz OAUTH_TROCA_TEMPORARIA', async () => {
    setup()
    renderTab('/settings/providers?provider=dropbox&status=error&error=OAUTH_TROCA_TEMPORARIA')
    expect(await screen.findByRole('alert')).toHaveTextContent('O provedor não respondeu. Tente conectar de novo.')
  })
})
