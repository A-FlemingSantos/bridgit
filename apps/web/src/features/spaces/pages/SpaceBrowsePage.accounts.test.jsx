import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SpaceBrowsePage from './SpaceBrowsePage.jsx'

vi.mock('../../../shared/hub/index.js', () => ({
  useConnections: vi.fn(),
  // The sidebar inside the page shell reads the provider rows.
  useProviders: () => ({ providers: [], status: 'ready' }),
  useFolder: vi.fn(),
  useHubActions: vi.fn(),
  usePublicLinks: () => ({ status: 'ready', entries: [], isPublic: () => false }),
  useShortcuts: vi.fn(),
}))

vi.mock('../../../shared/state/HubState.jsx', () => ({
  useHub: () => ({ openOverlay: vi.fn() }),
}))

vi.mock('../../../shared/auth/SessionContext.jsx', () => ({
  useSession: () => ({ user: { id: 'user-1', username: 'arthur' } }),
}))

import { useConnections, useFolder, useHubActions, useShortcuts } from '../../../shared/hub/index.js'

const router = { future: { v7_startTransition: true, v7_relativeSplatPath: true } }

const ANA = { connectionId: 'conn-ana', provider: 'onedrive', providerName: 'OneDrive', account: { email: 'ana@mail.com' } }
const BIA = { connectionId: 'conn-bia', provider: 'onedrive', providerName: 'OneDrive', account: { email: 'bia@mail.com' } }
const DROP = { connectionId: 'conn-drop', provider: 'dropbox', providerName: 'Dropbox', account: { email: 'ana@mail.com' } }

function setup(connections) {
  useConnections.mockReturnValue({ connections, status: 'ready' })
  useShortcuts.mockReturnValue({ status: 'ready', entries: [], isShortcut: () => false })
  useFolder.mockReturnValue({
    status: 'ready',
    folder: { ref: null, name: 'OneDrive', ancestry: [] },
    items: [
      { ref: 'folder-a', name: 'Anexos', kind: 'folder', connectionId: 'conn-bia', provider: 'onedrive' },
      { ref: 'file-a', name: 'Nota.txt', kind: 'file', connectionId: 'conn-bia', provider: 'onedrive' },
    ],
    nextCursor: null,
    error: null,
    loadMore: vi.fn(),
    reload: vi.fn(),
  })
  useHubActions.mockReturnValue({})
}

function renderPage(path = '/drives/conn-bia') {
  return render(
    <MemoryRouter {...router} initialEntries={[path]}>
      <Routes>
        <Route path="/home" element={<p>Início</p>} />
        <Route path="/drives/:connectionId" element={<SpaceBrowsePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('SpaceBrowsePage com várias contas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('titula a pasta com o provedor e o e-mail quando o provedor tem mais de uma conta', () => {
    setup([ANA, BIA, DROP])
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: 'OneDrive · bia@mail.com' })).toBeInTheDocument()
    expect(useFolder).toHaveBeenCalledWith('conn-bia', null)
  })

  it('titula só com o nome do provedor quando há uma conta', () => {
    setup([BIA, DROP])
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: 'OneDrive' })).toBeInTheDocument()
  })

  it('liga pastas e arquivos à mesma conta', () => {
    setup([ANA, BIA])
    renderPage()

    expect(screen.getByRole('link', { name: /Anexos/ })).toHaveAttribute('href', '/drives/conn-bia/folder/folder-a')
    expect(screen.getByRole('link', { name: /Nota\.txt/ })).toHaveAttribute('href', '/drives/conn-bia/file/file-a')
  })

  it('volta ao início quando a conta não está conectada', () => {
    setup([ANA])
    renderPage('/drives/conn-bia')

    expect(screen.getByText('Início')).toBeInTheDocument()
  })
})
