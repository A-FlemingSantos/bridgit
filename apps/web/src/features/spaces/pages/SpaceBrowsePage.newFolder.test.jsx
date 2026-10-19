import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SpaceBrowsePage from './SpaceBrowsePage.jsx'

vi.mock('../../../shared/hub/index.js', () => ({
  useFolder: vi.fn(),
  useHubActions: vi.fn(),
  usePublicLinks: () => ({ status: 'ready', entries: [], isPublic: () => false }),
  useProviders: vi.fn(),
  useShortcuts: vi.fn(),
}))

vi.mock('../../../shared/state/HubState.jsx', () => ({
  useHub: () => ({ openOverlay: vi.fn() }),
}))

vi.mock('../../../shared/auth/SessionContext.jsx', () => ({
  useSession: () => ({ user: { id: 'user-1', username: 'arthur' } }),
}))

import { useFolder, useHubActions, useProviders, useShortcuts } from '../../../shared/hub/index.js'

const router = { future: { v7_startTransition: true, v7_relativeSplatPath: true } }

function setup() {
  useProviders.mockReturnValue({
    providers: [{ id: 'onedrive', name: 'OneDrive', connected: true }],
    status: 'ready',
  })
  useShortcuts.mockReturnValue({ status: 'ready', entries: [], isShortcut: () => false })
  useFolder.mockReturnValue({
    status: 'ready',
    folder: { ref: null, name: 'OneDrive', ancestry: [] },
    items: [
      { ref: 'folder-a', name: 'Anexos', kind: 'folder' },
      { ref: 'folder-b', name: 'Documentos', kind: 'folder' },
    ],
    nextCursor: null,
    error: null,
    loadMore: vi.fn(),
    reload: vi.fn(),
  })
  const createFolder = vi.fn().mockResolvedValue({})
  useHubActions.mockReturnValue({ createFolder })
  return { createFolder }
}

// Lets a test move to another folder of the same page, as a click on a folder tile would.
let goTo = null
function NavigateProbe() {
  goTo = useNavigate()
  return null
}

function renderPage() {
  return render(
    <MemoryRouter {...router} initialEntries={['/providers/onedrive']}>
      <NavigateProbe />
      <Routes>
        <Route path="/providers/:provider" element={<SpaceBrowsePage />} />
        <Route path="/providers/:provider/folder/:folderRef" element={<SpaceBrowsePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function openDraft(user) {
  await user.click(screen.getByRole('button', { name: 'Mais ações' }))
  await user.click(await screen.findByRole('menuitem', { name: 'Nova pasta' }))
  return screen.findByRole('textbox', { name: 'Nome da nova pasta' })
}

describe('SpaceBrowsePage new folder draft', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Enter cria a pasta com o nome sugerido', async () => {
    const user = userEvent.setup()
    const { createFolder } = setup()
    renderPage()

    await openDraft(user)
    await user.keyboard('{Enter}')

    expect(createFolder).toHaveBeenCalledWith(expect.objectContaining({ name: 'Nova pasta', parentRef: null }))
  })

  it('perder o foco descarta o rascunho sem criar a pasta', async () => {
    const user = userEvent.setup()
    const { createFolder } = setup()
    renderPage()

    const field = await openDraft(user)
    field.blur()

    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Nome da nova pasta' })).not.toBeInTheDocument())
    expect(createFolder).not.toHaveBeenCalled()
  })

  it('Escape descarta o rascunho sem criar a pasta', async () => {
    const user = userEvent.setup()
    const { createFolder } = setup()
    renderPage()

    await openDraft(user)
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Nome da nova pasta' })).not.toBeInTheDocument())
    expect(createFolder).not.toHaveBeenCalled()
  })

  it('trocar de pasta descarta o rascunho', async () => {
    const user = userEvent.setup()
    const { createFolder } = setup()
    renderPage()

    await openDraft(user)
    goTo('/providers/onedrive/folder/folder-a')

    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Nome da nova pasta' })).not.toBeInTheDocument())
    expect(createFolder).not.toHaveBeenCalled()
  })
})
