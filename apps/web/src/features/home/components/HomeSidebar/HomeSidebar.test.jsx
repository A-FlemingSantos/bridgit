import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HomeSidebar from './HomeSidebar.jsx'

const hub = vi.hoisted(() => ({
  connect: vi.fn(),
  actions: { getConnectionAvatar: vi.fn() },
  providers: [],
}))

vi.mock('../../../../shared/hub/index.js', () => ({
  useHubActions: () => hub.actions,
  useProviders: () => ({ status: 'ready', providers: hub.providers, connect: hub.connect }),
}))

vi.mock('../../../../shared/auth/SessionContext.jsx', () => ({
  useSession: () => ({ user: { id: 'user-1', username: 'arthur' } }),
}))

const router = { future: { v7_startTransition: true, v7_relativeSplatPath: true } }

function account(connectionId, provider, providerName, email, name, extra = {}) {
  return {
    connectionId,
    provider,
    providerName,
    account: email ? { email, name } : null,
    lastError: null,
    generation: 1,
    ...extra,
  }
}

const googleA = account('conn-a', 'google-drive', 'Google Drive', 'ana@example.com', 'Ana Souza')
const googleB = account('conn-b', 'google-drive', 'Google Drive', 'bia@example.com', 'Bia Lima')

function setProviders(connections = []) {
  hub.providers = [
    { id: 'onedrive', name: 'OneDrive', configured: true, connected: false, connections: connections.filter((c) => c.provider === 'onedrive') },
    { id: 'google-drive', name: 'Google Drive', configured: true, connected: true, connections: connections.filter((c) => c.provider === 'google-drive') },
    { id: 'dropbox', name: 'Dropbox', configured: false, connected: false, connections: connections.filter((c) => c.provider === 'dropbox') },
  ]
}

function renderSidebar(props = {}) {
  return render(
    <MemoryRouter {...router} initialEntries={['/home?x=1']}>
      <HomeSidebar {...props} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  hub.connect.mockReset()
  hub.connect.mockResolvedValue(undefined)
  hub.actions.getConnectionAvatar.mockReset()
  hub.actions.getConnectionAvatar.mockRejectedValue(new Error('404'))
  setProviders([googleA, googleB])
})

describe('HomeSidebar accounts', () => {
  it('uses the username as the panel title and names the home link', () => {
    renderSidebar()

    expect(screen.getByText('arthur')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Início' })).toHaveAttribute('href', '/home')
  })

  it('lists each account of a provider as its own row with avatar and provider badge', () => {
    renderSidebar()
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })

    const ana = within(nav).getByRole('link', { name: 'Google Drive Ana Souza Conectado' })
    const bia = within(nav).getByRole('link', { name: 'Google Drive Bia Lima Conectado' })
    expect(ana).toHaveAttribute('href', '/drives/conn-a')
    expect(bia).toHaveAttribute('href', '/drives/conn-b')
    expect(within(ana).getByText('ana@example.com')).toBeInTheDocument()
    expect(within(ana).getByTestId('account-avatar-badge')).toBeInTheDocument()
    expect(within(bia).getByTestId('account-avatar-badge')).toBeInTheDocument()
  })

  it('keeps one ghost row per provider without an account', () => {
    renderSidebar()
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })

    expect(within(nav).getByRole('link', { name: 'OneDrive Desconectado' })).toHaveAttribute('href', '/settings/providers')
    expect(within(nav).getByRole('link', { name: 'Dropbox Desconectado' })).toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: /Google Drive Desconectado/ })).toBeNull()
  })

  it('names an account by email, then by provider, when data is missing', () => {
    setProviders([
      account('conn-c', 'google-drive', 'Google Drive', 'sem.nome@example.com', null),
      account('conn-d', 'onedrive', 'OneDrive', null, null),
    ])
    renderSidebar()

    const byEmail = screen.getByRole('link', { name: 'Google Drive sem.nome@example.com Conectado' })
    expect(within(byEmail).getByText('sem.nome@example.com')).toBeInTheDocument()
    expect(within(byEmail).getByText('Google Drive')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'OneDrive OneDrive Conectado' })).toHaveAttribute('href', '/drives/conn-d')
  })

  it('sends an expired account to settings', () => {
    setProviders([{ ...googleA, lastError: 'RECONEXAO_NECESSARIA' }, googleB])
    renderSidebar()

    const expired = screen.getByRole('link', { name: 'Google Drive Ana Souza Acesso expirado' })
    expect(expired).toHaveAttribute('href', '/settings/providers')
    expect(within(expired).getByText('Acesso expirado · Reconectar')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Google Drive Bia Lima Conectado' })).toHaveAttribute('href', '/drives/conn-b')
  })

  it('opens the add account menu and connects the chosen provider as an extra account', async () => {
    const user = userEvent.setup()
    const onConnect = vi.fn()
    renderSidebar({ onConnect })

    await user.click(screen.getByRole('button', { name: 'Nova conta' }))
    expect(screen.queryByRole('menuitem', { name: 'Dropbox' })).toBeNull()
    await user.click(screen.getByRole('menuitem', { name: 'Google Drive' }))

    expect(hub.connect).toHaveBeenCalledWith('google-drive', '/home?x=1', { addAccount: true })
    expect(onConnect).not.toHaveBeenCalled()
  })

  it('não renderiza seções retráteis, atalhos ou links públicos', () => {
    renderSidebar()

    expect(screen.queryByText('Dispositivos')).toBeNull()
    expect(screen.queryByText('Minhas contas')).toBeNull()
    expect(screen.queryByText('Atalhos')).toBeNull()
    expect(screen.queryByText('Links públicos')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Plano.pdf' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Link público de Plano' })).toBeNull()
  })
})
