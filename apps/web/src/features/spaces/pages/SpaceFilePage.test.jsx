import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SpaceFilePage from './SpaceFilePage.jsx'

vi.mock('../../../shared/hub/index.js', () => ({
  useHubActions: vi.fn(),
  useItem: vi.fn(),
  useProviders: vi.fn(),
  useShortcuts: vi.fn(),
}))

vi.mock('../../../shared/state/HubState.jsx', () => ({
  useHub: () => ({ openOverlay: vi.fn() }),
}))

import { useHubActions, useItem, useProviders, useShortcuts } from '../../../shared/hub/index.js'

const router = { future: { v7_startTransition: true, v7_relativeSplatPath: true } }

const item = {
  ref: 'file-1',
  provider: 'onedrive',
  name: 'Foto.png',
  kind: 'file',
  extension: 'png',
  mimeType: 'image/png',
  ancestry: [],
}

function setup(actions) {
  useProviders.mockReturnValue({
    providers: [{ id: 'onedrive', name: 'OneDrive', connected: true }],
    status: 'ready',
  })
  useShortcuts.mockReturnValue({ isShortcut: () => false })
  useItem.mockReturnValue({ status: 'ready', item, error: null, reload: vi.fn() })
  useHubActions.mockReturnValue(actions)
}

function renderPage() {
  return render(
    <MemoryRouter {...router} initialEntries={['/providers/onedrive/file/file-1']}>
      <Routes>
        <Route path="/providers/:provider/file/:fileRef" element={<SpaceFilePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('SpaceFilePage download e leitura', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => { vi.restoreAllMocks() })

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
    expect(getDownloadUrl).toHaveBeenNthCalledWith(1, { providerId: 'onedrive', ref: 'file-1' })
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
    expect(getReadSource).toHaveBeenLastCalledWith({ providerId: 'onedrive', ref: 'file-1', refresh: true })
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
      <MemoryRouter {...router} initialEntries={['/providers/onedrive/file/file-1']}>
        <Routes>
          <Route path="/providers/:provider/file/:fileRef" element={<SpaceFilePage />} />
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
