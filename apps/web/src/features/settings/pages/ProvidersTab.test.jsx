import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
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
