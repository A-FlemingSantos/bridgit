import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SpaceFilePage from './SpaceFilePage.jsx'

vi.mock('../../../shared/hub/index.js', () => ({
  useHubActions: vi.fn(),
  useItem: vi.fn(),
  usePublicLinks: () => ({ status: 'ready', entries: [] }),
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

// jsdom has no canvas to draw the code editor's minimap on.
vi.mock('@replit/codemirror-minimap', () => ({ showMinimap: { compute: () => [] } }))

import { useConnections, useHubActions, useItem, useShortcuts } from '../../../shared/hub/index.js'

const router = { future: { v7_startTransition: true, v7_relativeSplatPath: true } }

const item = {
  ref: 'file-1',
  provider: 'onedrive',
  connectionId: 'conn-1',
  name: 'Foto.png',
  kind: 'file',
  extension: 'png',
  mimeType: 'image/png',
  ancestry: [],
}

function setup(actions) {
  useConnections.mockReturnValue({
    connections: [{ connectionId: 'conn-1', provider: 'onedrive', providerName: 'OneDrive' }],
    status: 'ready',
  })
  useShortcuts.mockReturnValue({ status: 'ready', entries: [], isShortcut: () => false })
  useItem.mockReturnValue({ status: 'ready', item, error: null, reload: vi.fn() })
  useHubActions.mockReturnValue(actions)
}

function renderPage() {
  return render(
    <MemoryRouter {...router} initialEntries={['/drives/conn-1/file/file-1']}>
      <Routes>
        <Route path="/drives/:connectionId/file/:fileRef" element={<SpaceFilePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('SpaceFilePage download e leitura', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('mostra so o nome do arquivo com a meta abaixo, sem breadcrumb', async () => {
    setup({
      recordRecent: vi.fn().mockResolvedValue(undefined),
      getReadSource: vi.fn().mockResolvedValue({ mode: 'image', url: '/foto.png' }),
      getDownloadUrl: vi.fn(),
    })
    useItem.mockReturnValue({ status: 'ready', item: { ...item, size: 2516582 }, error: null, reload: vi.fn() })
    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: 'Foto.png' })).toBeInTheDocument()
    expect(screen.getByText('PNG · OneDrive · 2.4 MB')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Localização atual' })).toBeNull()
    expect(screen.getAllByRole('heading', { name: 'Foto.png' })).toHaveLength(1)
  })

  it('busca um ticket novo a cada clique em Baixar', async () => {
    const user = userEvent.setup()
    const getDownloadUrl = vi.fn()
      .mockResolvedValueOnce('https://tickets.test/primeiro')
      .mockResolvedValueOnce('https://tickets.test/segundo')
    setup({
      recordRecent: vi.fn().mockResolvedValue(undefined),
      getReadSource: vi.fn().mockResolvedValue({ mode: 'image', url: '/foto.png' }),
      getDownloadUrl,
    })
    renderPage()

    const download = await screen.findByRole('button', { name: 'Baixar' })
    await user.click(download)
    await waitFor(() => {
      expect(getDownloadUrl).toHaveBeenCalledTimes(1)
    })
    await user.click(screen.getByRole('button', { name: 'Baixar' }))
    await waitFor(() => {
      expect(getDownloadUrl).toHaveBeenCalledTimes(2)
    })
    expect(getDownloadUrl).toHaveBeenNthCalledWith(1, { connectionId: 'conn-1', ref: 'file-1' })
  })

  it('mostra erro de download sem travar o botão', async () => {
    const user = userEvent.setup()
    setup({
      recordRecent: vi.fn().mockResolvedValue(undefined),
      getReadSource: vi.fn().mockResolvedValue({ mode: 'image', url: '/foto.png' }),
      getDownloadUrl: vi.fn().mockRejectedValue(new Error('Ticket expirado')),
    })
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Baixar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ticket expirado')
    expect(screen.getByRole('button', { name: 'Baixar' })).toBeEnabled()
  })

  it('pede fonte nova ao tentar de novo sem laço', async () => {
    const user = userEvent.setup()
    const getReadSource = vi.fn().mockResolvedValue({ mode: 'image', url: '/foto.png' })
    setup({
      recordRecent: vi.fn().mockResolvedValue(undefined),
      getReadSource,
      getDownloadUrl: vi.fn().mockResolvedValue('https://tickets.test/x'),
    })
    renderPage()

    await waitFor(() => {
      expect(document.querySelector('img[alt="Foto.png"]')).toBeTruthy()
    })
    fireEvent.error(document.querySelector('img[alt="Foto.png"]'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar a imagem.')
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

    await waitFor(() => {
      expect(getReadSource).toHaveBeenCalledTimes(2)
    })
    await waitFor(() => {
      expect(getReadSource).toHaveBeenCalledTimes(2)
    })
  })

  it('renova a fonte vencida sem repetir a recuperação se o ticket novo ainda é válido', async () => {
    const expired = new Date(Date.now() - 1000).toISOString()
    const valid = new Date(Date.now() + 300_000).toISOString()
    const getReadSource = vi
      .fn()
      .mockResolvedValueOnce({ mode: 'image', url: '/velha.png', expiresAt: expired })
      .mockResolvedValue({ mode: 'image', url: '/nova.png', expiresAt: valid })
    setup({
      recordRecent: vi.fn().mockResolvedValue(undefined),
      getReadSource,
      getDownloadUrl: vi.fn().mockResolvedValue('https://tickets.test/x'),
    })
    renderPage()

    await waitFor(() => {
      expect(document.querySelector('img[src="/velha.png"]')).toBeTruthy()
    })
    fireEvent.error(document.querySelector('img[src="/velha.png"]'))

    await waitFor(() => {
      expect(document.querySelector('img[src="/nova.png"]')).toBeTruthy()
    })
    expect(getReadSource).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()

    fireEvent.error(document.querySelector('img[src="/nova.png"]'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar a imagem.')
    expect(getReadSource).toHaveBeenCalledTimes(2)
  })

  it('recupera dois vencimentos durante a mesma leitura mantendo a mídia e a posição', async () => {
    const initialTime = Date.now()
    let currentTime = initialTime
    vi.spyOn(Date, 'now').mockImplementation(() => currentTime)
    const getReadSource = vi.fn().mockImplementation(() => Promise.resolve({
      mode: 'video', url: `/video-${getReadSource.mock.calls.length}`, revision: 'r-1',
      expiresAt: new Date(currentTime + 300_000).toISOString(),
    }))
    setup({ recordRecent: vi.fn().mockResolvedValue(), getReadSource })
    renderPage()
    await waitFor(() => expect(document.querySelector('video')?.getAttribute('src')).toBe('/video-1'))
    const video = document.querySelector('video')
    fireEvent.loadedData(video)
    video.currentTime = 37
    fireEvent.timeUpdate(video)

    for (let cycle = 1; cycle <= 2; cycle += 1) {
      currentTime = initialTime + cycle * 360_000
      fireEvent.error(video)
      await waitFor(() => expect(video.getAttribute('src')).toBe(`/video-${cycle + 1}`))
      expect(document.querySelector('video')).toBe(video)
      expect(screen.queryByRole('alert')).toBeNull()
      expect(screen.queryByRole('status', { name: 'Carregando arquivo' })).toBeNull()
      video.currentTime = 0
      fireEvent.loadedData(video)
      expect(video.currentTime).toBe(37)
    }
    expect(getReadSource).toHaveBeenCalledTimes(3)
    expect(getReadSource).toHaveBeenLastCalledWith({ connectionId: 'conn-1', ref: 'file-1', refresh: true })
  })

  it('agrupa falhas simultâneas enquanto aguarda a recuperação de um ticket', async () => {
    let resolveRecovery
    const getReadSource = vi.fn()
      .mockResolvedValueOnce({ mode: 'video', url: '/expired', revision: 'r-1', expiresAt: new Date(Date.now() - 1000).toISOString() })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRecovery = resolve }))
    setup({ recordRecent: vi.fn().mockResolvedValue(), getReadSource })
    renderPage()
    await waitFor(() => expect(document.querySelector('video')).toBeTruthy())
    const video = document.querySelector('video')
    fireEvent.loadedData(video)
    fireEvent.error(video)
    fireEvent.error(video)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.querySelector('video')).toBe(video)
    expect(getReadSource).toHaveBeenCalledTimes(2)
    await act(async () => resolveRecovery({ mode: 'video', url: '/renewed', revision: 'r-1', expiresAt: new Date(Date.now() + 300_000).toISOString() }))
    expect(video.getAttribute('src')).toBe('/renewed')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('ignora a resposta de nova tentativa obsoleta após trocar de arquivo', async () => {
    const user = userEvent.setup()
    let resolveStaleRetry
    const getReadSource = vi.fn().mockImplementation(({ ref }) => {
      if (ref === 'file-1') {
        const callsForFile1 = getReadSource.mock.calls.filter(([{ ref: r }]) => r === 'file-1').length
        if (callsForFile1 === 1) {
          return Promise.resolve({ mode: 'image', url: '/foto-1.png' })
        }
        return new Promise((resolve) => {
          resolveStaleRetry = () => resolve({ mode: 'image', url: '/foto-obsoleta.png' })
        })
      }
      return Promise.resolve({ mode: 'image', url: '/foto-2.png' })
    })
    setup({
      recordRecent: vi.fn().mockResolvedValue(undefined),
      getReadSource,
      getDownloadUrl: vi.fn().mockResolvedValue('https://tickets.test/x'),
    })
    const view = renderPage()

    await waitFor(() => {
      expect(document.querySelector('img[src="/foto-1.png"]')).toBeTruthy()
    })
    fireEvent.error(document.querySelector('img[src="/foto-1.png"]'))
    await user.click(await screen.findByRole('button', { name: 'Tentar novamente' }))
    await waitFor(() => {
      expect(getReadSource.mock.calls.filter(([{ ref }]) => ref === 'file-1')).toHaveLength(2)
    })

    useItem.mockReturnValue({
      status: 'ready',
      item: { ...item, ref: 'file-2', name: 'Outra.png' },
      error: null,
      reload: vi.fn(),
    })
    view.rerender(
      <MemoryRouter {...router} initialEntries={['/drives/conn-1/file/file-1']}>
        <Routes>
          <Route path="/drives/:connectionId/file/:fileRef" element={<SpaceFilePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(document.querySelector('img[src="/foto-2.png"]')).toBeTruthy()
    })
    resolveStaleRetry?.()
    await act(async () => {})
    expect(document.querySelector('img[src="/foto-2.png"]')).toBeTruthy()
    expect(document.querySelector('img[src="/foto-obsoleta.png"]')).toBeNull()
  })
})

describe('SpaceFilePage salvando código', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('salva pelo hub e mostra o status ao lado de Baixar', async () => {
    const code = { ...item, name: 'a.py', extension: 'py', mimeType: 'text/x-python' }
    const saveFileContent = vi.fn().mockResolvedValue({ item: code, revision: 'r2' })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode('x = 1').buffer })))
    setup({
      recordRecent: vi.fn().mockResolvedValue(undefined),
      getReadSource: vi.fn().mockResolvedValue({ mode: 'text', url: '/a.py', editable: true, revision: 'r1' }),
      getDownloadUrl: vi.fn(),
      saveFileContent,
    })
    useItem.mockReturnValue({ status: 'ready', item: code, error: null, reload: vi.fn() })
    renderPage()

    await waitFor(() => expect(document.querySelector('.cm-content')).toHaveAttribute('contenteditable', 'true'))
    const { EditorView } = await import('@codemirror/view')
    const view = EditorView.findFromDOM(document.querySelector('.cm-editor'))
    act(() => view.dispatch({ changes: { from: 0, insert: '#' } }))
    fireEvent.keyDown(window, { key: 's', ctrlKey: true })

    await waitFor(() => expect(saveFileContent).toHaveBeenCalledTimes(1))
    expect(saveFileContent).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: 'conn-1', ref: 'file-1', baseRevision: 'r1', overwrite: false }),
    )
    expect(await screen.findByText('Salvo')).toBeInTheDocument()
  })
})

describe('SpaceFilePage visualizar código fonte', () => {
  const markdown = { ...item, name: 'a.md', extension: 'md', mimeType: 'text/markdown' }
  const toggleName = 'Visualizar código fonte'

  function setupText(file, source = { mode: 'text', url: '/a.md', editable: true, revision: 'r1' }) {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode('# oi').buffer })))
    setup({
      recordRecent: vi.fn().mockResolvedValue(undefined),
      getReadSource: vi.fn().mockResolvedValue(source),
      getDownloadUrl: vi.fn(),
      saveFileContent: vi.fn(),
    })
    useItem.mockReturnValue({ status: 'ready', item: file, error: null, reload: vi.fn() })
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('alterna o botão em arquivos markdown de texto', async () => {
    const user = userEvent.setup()
    setupText(markdown)
    renderPage()

    const toggle = await screen.findByRole('button', { name: toggleName })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(toggle.nextElementSibling).toBe(screen.getByRole('button', { name: 'Baixar' }))
    await user.click(toggle)
    expect(screen.getByRole('button', { name: toggleName })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: toggleName }))
    expect(screen.getByRole('button', { name: toggleName })).toHaveAttribute('aria-pressed', 'false')
  })

  it('não mostra o botão em código que não é markdown', async () => {
    setupText({ ...item, name: 'a.py', extension: 'py', mimeType: 'text/x-python' }, { mode: 'text', url: '/a.py', editable: true })
    renderPage()

    await screen.findByRole('button', { name: 'Baixar' })
    await waitFor(() => expect(document.querySelector('.cm-content')).toBeTruthy())
    expect(screen.queryByRole('button', { name: toggleName })).toBeNull()
  })

  it('não mostra o botão quando a fonte não é de texto', async () => {
    setupText(markdown, { mode: 'image', url: '/a.md' })
    renderPage()

    await screen.findByRole('button', { name: 'Baixar' })
    await act(async () => {})
    expect(screen.queryByRole('button', { name: toggleName })).toBeNull()
  })

  it('volta a visualizar ao trocar de arquivo', async () => {
    const user = userEvent.setup()
    setupText(markdown)
    const view = renderPage()

    await user.click(await screen.findByRole('button', { name: toggleName }))
    expect(screen.getByRole('button', { name: toggleName })).toHaveAttribute('aria-pressed', 'true')

    useItem.mockReturnValue({
      status: 'ready',
      item: { ...markdown, ref: 'file-2', name: 'b.md' },
      error: null,
      reload: vi.fn(),
    })
    view.rerender(
      <MemoryRouter {...router} initialEntries={['/drives/conn-1/file/file-1']}>
        <Routes>
          <Route path="/drives/:connectionId/file/:fileRef" element={<SpaceFilePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() =>
      expect(screen.getByRole('button', { name: toggleName })).toHaveAttribute('aria-pressed', 'false'),
    )
  })
})
