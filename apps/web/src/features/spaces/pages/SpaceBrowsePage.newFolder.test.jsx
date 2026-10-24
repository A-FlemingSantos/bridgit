import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SpaceBrowsePage from './SpaceBrowsePage.jsx'

vi.mock('../../../shared/hub/index.js', () => ({
  useFolder: vi.fn(),
  useHubActions: vi.fn(),
  usePublicLinks: () => ({ status: 'ready', entries: [], isPublic: () => false }),
  useConnections: vi.fn(),
  // The sidebar inside the page shell reads the provider rows.
  useProviders: () => ({ providers: [], status: 'ready' }),
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

function setup() {
  useConnections.mockReturnValue({
    connections: [{ connectionId: 'conn-1', provider: 'onedrive', providerName: 'OneDrive' }],
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
let currentPath = null
function NavigateProbe() {
  goTo = useNavigate()
  currentPath = useLocation().pathname
  return null
}

function renderPage() {
  return render(
    <MemoryRouter {...router} initialEntries={['/drives/conn-1']}>
      <NavigateProbe />
      <Routes>
        <Route path="/drives/:connectionId" element={<SpaceBrowsePage />} />
        <Route path="/drives/:connectionId/folder/:folderRef" element={<SpaceBrowsePage />} />
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

    // The draft leaves with an exit animation, which can run long when the whole suite is busy.
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Nome da nova pasta' })).not.toBeInTheDocument(), { timeout: 3000 })
    expect(createFolder).not.toHaveBeenCalled()
  })

  it('Escape descarta o rascunho sem criar a pasta', async () => {
    const user = userEvent.setup()
    const { createFolder } = setup()
    renderPage()

    await openDraft(user)
    await user.keyboard('{Escape}')

    // The draft leaves with an exit animation, which can run long when the whole suite is busy.
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Nome da nova pasta' })).not.toBeInTheDocument(), { timeout: 3000 })
    expect(createFolder).not.toHaveBeenCalled()
  })

  it('trocar de pasta descarta o rascunho', async () => {
    const user = userEvent.setup()
    const { createFolder } = setup()
    renderPage()

    await openDraft(user)
    goTo('/drives/conn-1/folder/folder-a')

    // The draft leaves with an exit animation, which can run long when the whole suite is busy.
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Nome da nova pasta' })).not.toBeInTheDocument(), { timeout: 3000 })
    expect(createFolder).not.toHaveBeenCalled()
  })
})

describe('SpaceBrowsePage tile selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('clicar no contorno seleciona sem abrir; no nome, abre', async () => {
    const user = userEvent.setup()
    setup()
    renderPage()

    const tile = await screen.findByRole('link', { name: /Anexos/ })
    await user.click(tile)
    expect(tile).toHaveAttribute('data-selected', 'true')
    expect(tile.closest('main')).toBeInTheDocument()

    await user.click(within(tile).getByText('Anexos'))
    await waitFor(() => expect(currentPath).toBe('/drives/conn-1/folder/folder-a'))
  })

  it('clicar fora tira a seleção', async () => {
    const user = userEvent.setup()
    setup()
    renderPage()

    const tile = await screen.findByRole('link', { name: /Anexos/ })
    await user.click(tile)
    expect(tile).toHaveAttribute('data-selected', 'true')
    await user.click(document.body)
    expect(tile).not.toHaveAttribute('data-selected')
  })
})

describe('SpaceBrowsePage multiple selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('cada clique no destaque soma ou tira o item; Shift soma o intervalo', async () => {
    const user = userEvent.setup()
    setup()
    renderPage()

    const anexos = await screen.findByRole('link', { name: /Anexos/ })
    const documentos = screen.getByRole('link', { name: /Documentos/ })
    const selected = () => screen.queryAllByRole('link').filter((link) => link.getAttribute('data-selected') === 'true')

    await user.click(anexos)
    await user.click(documentos)
    expect(selected()).toEqual([anexos, documentos])

    await user.click(anexos)
    expect(selected()).toEqual([documentos])

    await user.click(documentos)
    expect(selected()).toEqual([])

    await user.click(anexos)
    await user.keyboard('{Shift>}')
    await user.click(documentos)
    await user.keyboard('{/Shift}')
    expect(selected()).toEqual([anexos, documentos])
  })
})

describe('SpaceBrowsePage selection actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('a faixa de ações abre junto com a seleção e some quando ela acaba', async () => {
    const user = userEvent.setup()
    setup()
    renderPage()

    expect(await screen.findByRole('link', { name: /Anexos/ })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Ações da seleção' })).toBeNull()

    await user.click(screen.getByRole('link', { name: /Anexos/ }))
    const strip = screen.getByRole('region', { name: 'Ações da seleção' })
    expect(within(strip).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Baixar',
      'Mover',
      'Cor',
      'Excluir',
    ])

    await user.click(within(strip).getByRole('button', { name: 'Cor' }))
    expect(screen.getByRole('link', { name: /Anexos/ }).getAttribute('data-selected')).toBe('true')

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Ações da seleção' })).toBeNull())
  })
})
