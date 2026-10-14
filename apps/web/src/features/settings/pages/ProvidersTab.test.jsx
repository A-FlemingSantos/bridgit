import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProvidersTab from './ProvidersTab.jsx'

vi.mock('../../../shared/hub/hooks.js', () => ({
  useProviders: vi.fn(),
}))

import { useProviders } from '../../../shared/hub/hooks.js'

const router = { future: { v7_startTransition: true, v7_relativeSplatPath: true } }

const providers = [
  {
    id: 'onedrive',
    name: 'OneDrive',
    configured: true,
    connected: true,
    account: { email: 'arthur@outlook.com' },
    lastError: null,
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    configured: true,
    connected: false,
    account: null,
    lastError: null,
  },
]

function setup({ connect, disconnect }) {
  useProviders.mockReturnValue({
    status: 'ready',
    providers,
    error: null,
    connect,
    disconnect,
  })
}

function renderTab() {
  return render(
    <MemoryRouter {...router} initialEntries={['/settings/providers']}>
      <ProvidersTab />
    </MemoryRouter>,
  )
}

describe('ProvidersTab erros de ação', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mostra erro de conexão no provedor e limpa na nova tentativa', async () => {
    const user = userEvent.setup()
    const connect = vi.fn()
      .mockRejectedValueOnce(new Error('falha ao conectar'))
      .mockResolvedValueOnce(undefined)
    setup({ connect, disconnect: vi.fn() })
    renderTab()

    await user.click(screen.getByRole('button', { name: 'Conectar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('falha ao conectar')
    expect(screen.getByRole('button', { name: 'Conectar' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Conectar' }))
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
    expect(connect).toHaveBeenCalledTimes(2)
  })

  it('mantém a confirmação aberta quando desconectar falha', async () => {
    const user = userEvent.setup()
    const disconnect = vi.fn()
      .mockRejectedValueOnce(new Error('falha ao desconectar'))
      .mockResolvedValueOnce([{ ...providers[0], connected: false }])
    setup({ connect: vi.fn(), disconnect })
    renderTab()

    const cards = screen.getAllByText('OneDrive')
    const card = cards[0].closest('div')
    expect(card).toBeTruthy()
    await user.click(within(card.parentElement).getByRole('button', { name: 'Desconectar' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('falha ao desconectar')
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument()
    })
  })

  it('não mistura erro de um provedor com outro', async () => {
    const user = userEvent.setup()
    setup({ connect: vi.fn().mockRejectedValue(new Error('só dropbox')), disconnect: vi.fn() })
    renderTab()

    await user.click(screen.getByRole('button', { name: 'Conectar' }))
    const alerts = await screen.findAllByRole('alert')
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toHaveTextContent('só dropbox')
  })
})

describe('ProvidersTab acesso expirado', () => {
  it('mostra o acesso expirado e Reconectar no lugar da conta', () => {
    useProviders.mockReturnValue({
      status: 'ready',
      providers: [{ ...providers[0], lastError: 'RECONEXAO_NECESSARIA' }],
      error: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
    })
    renderTab()

    expect(screen.getByText(/Acesso expirado/)).toBeInTheDocument()
    expect(screen.queryByText('arthur@outlook.com')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reconectar' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Desconectar' })).not.toBeInTheDocument()
  })
})

describe('ProvidersTab aviso de retorno do OAuth', () => {
  function renderReturn(search) {
    let lastLocation = null
    function LocationProbe() {
      lastLocation = useLocation()
      return null
    }
    useProviders.mockReturnValue({ status: 'ready', providers, error: null, connect: vi.fn(), disconnect: vi.fn() })
    render(
      <MemoryRouter {...router} initialEntries={[`/settings/providers${search}`]}>
        <ProvidersTab />
        <LocationProbe />
      </MemoryRouter>,
    )
    return () => lastLocation
  }

  it('mostra o aviso uma vez, limpa a URL e permite dispensar', async () => {
    const user = userEvent.setup()
    const location = renderReturn('?provider=onedrive&status=connected&background=%2Fhome')

    expect(await screen.findByText('OneDrive conectado')).toBeInTheDocument()
    await waitFor(() => expect(location().search).toBe(''))
    expect(location().state).toEqual({ backgroundLocation: expect.objectContaining({ pathname: '/home' }) })
    expect(screen.getByText('OneDrive conectado')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Dispensar' }))
    expect(screen.queryByText('OneDrive conectado')).not.toBeInTheDocument()
  })

  it('some sozinho depois de um tempo quando a conexão deu certo', async () => {
    vi.useFakeTimers()
    renderReturn('?provider=onedrive&status=connected')

    expect(screen.getByText('OneDrive conectado')).toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(6500) })
    expect(screen.queryByText('OneDrive conectado')).not.toBeInTheDocument()
  })

  it('traduz OAUTH_CODE_AUSENTE', async () => {
    renderReturn('?provider=dropbox&status=error&error=OAUTH_CODE_AUSENTE')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O provedor não devolveu a autorização. Tente conectar de novo.',
    )
  })
})
