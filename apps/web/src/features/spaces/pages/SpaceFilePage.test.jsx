import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
})
