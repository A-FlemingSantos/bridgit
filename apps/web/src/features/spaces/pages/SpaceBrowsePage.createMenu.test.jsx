import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SpaceBrowsePage from './SpaceBrowsePage.jsx'

vi.mock('../../../shared/hub/index.js', () => ({
  useFolder: vi.fn(),
  useHubActions: vi.fn(),
  usePublicLinks: () => ({ status: 'ready', entries: [], isPublic: () => false }),
  useConnections: vi.fn(),
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
    items: [],
    nextCursor: null,
    error: null,
    loadMore: vi.fn(),
    reload: vi.fn(),
  })
  let nextFolder = 0
  const createFolder = vi.fn(async ({ name }) => ({ ref: `folder-${(nextFolder += 1)}`, name }))
  const uploadFiles = vi.fn().mockResolvedValue([])
  useHubActions.mockReturnValue({ createFolder, uploadFiles })
  return { createFolder, uploadFiles }
}

function renderPage() {
  return render(
    <MemoryRouter {...router} initialEntries={['/drives/conn-1']}>
      <Routes>
        <Route path="/drives/:connectionId" element={<SpaceBrowsePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function choose(user, name) {
  await user.click(screen.getByRole('button', { name: 'Criar ou Enviar' }))
  await user.click(await screen.findByRole('menuitem', { name }))
}

describe('SpaceBrowsePage menu Criar ou Enviar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('é um botão único com as seis opções na ordem pedida', async () => {
    const user = userEvent.setup()
    setup()
    renderPage()

    expect(screen.queryByRole('button', { name: 'Mais ações' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Criar ou Enviar' }))
    const items = await screen.findAllByRole('menuitem')
    expect(items.map((item) => item.textContent)).toEqual([
      'Novo arquivo',
      'Nova pasta',
      'Enviar arquivos',
      'Enviar pasta',
      'Arquivo de texto',
      'Arquivo markdown',
    ])
  })

  it('Arquivo de texto cria um .txt vazio com o nome digitado', async () => {
    const user = userEvent.setup()
    const { uploadFiles } = setup()
    renderPage()

    await choose(user, 'Arquivo de texto')
    const field = await screen.findByRole('textbox', { name: 'Nome do novo arquivo' })
    await user.clear(field)
    await user.type(field, 'notas{Enter}')

    await waitFor(() => expect(uploadFiles).toHaveBeenCalledTimes(1))
    const { files, parentRef } = uploadFiles.mock.calls[0][0]
    expect(parentRef).toBeNull()
    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('notas.txt')
    expect(files[0].size).toBe(0)
    expect(files[0].type).toBe('text/plain')
  })

  it('Arquivo markdown cria um .md e não repete a extensão', async () => {
    const user = userEvent.setup()
    const { uploadFiles } = setup()
    renderPage()

    await choose(user, 'Arquivo markdown')
    const field = await screen.findByRole('textbox', { name: 'Nome do novo arquivo' })
    await user.clear(field)
    await user.type(field, 'leia-me.md{Enter}')

    await waitFor(() => expect(uploadFiles).toHaveBeenCalledTimes(1))
    expect(uploadFiles.mock.calls[0][0].files[0].name).toBe('leia-me.md')
  })

  it('Novo arquivo usa o nome exatamente como digitado', async () => {
    const user = userEvent.setup()
    const { uploadFiles } = setup()
    renderPage()

    await choose(user, 'Novo arquivo')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(uploadFiles).toHaveBeenCalledTimes(1))
    expect(uploadFiles.mock.calls[0][0].files[0].name).toBe('Novo arquivo')
  })

  it('Escape descarta o rascunho do arquivo sem enviar nada', async () => {
    const user = userEvent.setup()
    const { uploadFiles } = setup()
    renderPage()

    await choose(user, 'Arquivo de texto')
    await screen.findByRole('textbox', { name: 'Nome do novo arquivo' })
    await user.keyboard('{Escape}')

    await waitFor(
      () => expect(screen.queryByRole('textbox', { name: 'Nome do novo arquivo' })).not.toBeInTheDocument(),
      { timeout: 3000 },
    )
    expect(uploadFiles).not.toHaveBeenCalled()
  })

  it('Enviar pasta recria as subpastas antes de enviar os arquivos de cada uma', async () => {
    const user = userEvent.setup()
    const { createFolder, uploadFiles } = setup()
    renderPage()

    const input = document.querySelector('input[webkitdirectory]')
    const rootFile = new File(['a'], 'a.txt')
    const nestedFile = new File(['b'], 'b.txt')
    Object.defineProperty(rootFile, 'webkitRelativePath', { value: 'Projeto/a.txt' })
    Object.defineProperty(nestedFile, 'webkitRelativePath', { value: 'Projeto/docs/b.txt' })
    await user.upload(input, [nestedFile, rootFile])

    await waitFor(() => expect(uploadFiles).toHaveBeenCalledTimes(2))
    expect(createFolder.mock.calls.map(([args]) => [args.name, args.parentRef])).toEqual([
      ['Projeto', null],
      ['docs', 'folder-1'],
    ])
    const sent = uploadFiles.mock.calls.map(([args]) => [args.parentRef, args.files.map((file) => file.name)])
    expect(sent).toContainEqual(['folder-1', ['a.txt']])
    expect(sent).toContainEqual(['folder-2', ['b.txt']])
  })
})
