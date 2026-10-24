import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AppHeader from './AppHeader.jsx'

const sessionApi = vi.hoisted(() => ({ user: null }))

vi.mock('../../auth/SessionContext.jsx', () => ({
  useSession: () => sessionApi,
}))

const hub = vi.hoisted(() => ({
  connect: vi.fn(),
  providers: [],
}))

vi.mock('../../hub/index.js', () => ({
  useHubActions: () => ({ getConnectionAvatar: vi.fn().mockRejectedValue(new Error('404')) }),
  useProviders: () => ({ status: 'ready', providers: hub.providers, connect: hub.connect }),
}))

const router = { future: { v7_startTransition: true, v7_relativeSplatPath: true } }

function renderHeader(props = {}) {
  return render(
    <MemoryRouter {...router} initialEntries={['/home?x=1']}>
      <AppHeader {...props} />
    </MemoryRouter>,
  )
}

function connection(connectionId, provider, providerName, email, name, lastError = null) {
  return { connectionId, provider, providerName, account: { email, name }, lastError, generation: 1 }
}

describe('AppHeader', () => {
  it('mostra o ícone pixel-art no botão da conta', () => {
    const { container } = renderHeader()
    const icon = container.querySelector('[aria-label="Conta"] svg')
    expect(icon).not.toBeNull()
    expect(icon.getAttribute('aria-hidden')).toBe('true')
  })

  describe('trilho recolhido', () => {
    const panel = { collapsed: true, onToggle: vi.fn(), id: 'panel' }

    beforeEach(() => {
      hub.connect.mockReset()
      hub.connect.mockResolvedValue(undefined)
      hub.providers = [
        { id: 'onedrive', name: 'OneDrive', configured: true, connections: [] },
        {
          id: 'google-drive',
          name: 'Google Drive',
          configured: true,
          connections: [
            connection('conn-a', 'google-drive', 'Google Drive', 'ana@example.com', 'Ana Souza'),
            connection('conn-b', 'google-drive', 'Google Drive', 'bia@example.com', 'Bia Lima', 'RECONEXAO_NECESSARIA'),
          ],
        },
      ]
    })

    it('mostra um avatar por conta, com o selo do provedor', () => {
      renderHeader({ panel })
      const nav = screen.getByRole('navigation', { name: 'Minhas contas' })

      const ana = within(nav).getByRole('link', { name: 'Google Drive Ana Souza Conectado' })
      expect(ana).toHaveAttribute('href', '/drives/conn-a')
      expect(within(ana).getByTestId('account-avatar-badge')).toBeInTheDocument()

      const bia = within(nav).getByRole('link', { name: 'Google Drive Bia Lima Acesso expirado' })
      expect(bia).toHaveAttribute('href', '/settings/providers')
      expect(within(nav).getByRole('link', { name: 'OneDrive Desconectado' })).toBeInTheDocument()
    })

    it('abre o menu de nova conta e conecta o provedor como conta adicional', async () => {
      const user = userEvent.setup()
      renderHeader({ panel })

      await user.click(screen.getByRole('button', { name: 'Nova conta' }))
      await user.click(screen.getByRole('menuitem', { name: 'OneDrive' }))

      expect(hub.connect).toHaveBeenCalledWith('onedrive', '/home?x=1', { addAccount: true })
    })
  })
})
