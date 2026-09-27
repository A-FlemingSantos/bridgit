import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SpaceBrowsePage from './SpaceBrowsePage.jsx'
import { HubUploadError } from '../../../shared/hub/hubErrors.js'

vi.mock('../../../shared/hub/index.js', () => ({
  useFolder: vi.fn(),
  useHubActions: vi.fn(),
  useProviders: vi.fn(),
  useShortcuts: vi.fn(),
}))

vi.mock('../../../shared/state/HubState.jsx', () => ({
  useHub: () => ({ openOverlay: vi.fn() }),
}))

import { useFolder, useHubActions, useProviders, useShortcuts } from '../../../shared/hub/index.js'

const router = { future: { v7_startTransition: true, v7_relativeSplatPath: true } }

function setup({ uploadFiles }) {
  useProviders.mockReturnValue({
    providers: [{ id: 'onedrive', name: 'OneDrive', connected: true }],
    status: 'ready',
  })
  useShortcuts.mockReturnValue({ isShortcut: () => false })
  useFolder.mockReturnValue({
    status: 'ready',
    folder: { ref: null, name: 'OneDrive', ancestry: [] },
    items: [],
    nextCursor: null,
    error: null,
    loadMore: vi.fn(),
    reload: vi.fn(),
  })
  useHubActions.mockReturnValue({ uploadFiles })
}

function renderPage() {
  return render(
    <MemoryRouter {...router} initialEntries={['/providers/onedrive']}>
      <Routes>
        <Route path="/providers/:provider" element={<SpaceBrowsePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function uploadInput() {
  return document.querySelector('input[type="file"]')
}

describe('SpaceBrowsePage upload retry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reenvia só o rejeitado explícito e não o ambíguo', async () => {
    const user = userEvent.setup()
    const explicitFile = new File(['a'], 'a.txt', { type: 'text/plain' })
    const ambiguousFile = new File(['b'], 'b.txt', { type: 'text/plain' })
    const failure = new HubUploadError('1 de 2 arquivos enviados. Falhou: a.txt. Verificando: b.txt.', {
      uploaded: [],
      failed: [
        { file: explicitFile, error: new Error('rejeitado'), ambiguous: false },
        { file: ambiguousFile, error: new Error('rede'), ambiguous: true },
      ],
    })
    const uploadFiles = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce([])
    setup({ uploadFiles })
    renderPage()

    await user.upload(uploadInput(), [explicitFile, ambiguousFile])
    expect(await screen.findByRole('alert')).toHaveTextContent('Falhou: a.txt. Verificando: b.txt.')
    expect(screen.getByRole('status')).toHaveTextContent('pode ter sido concluído')

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    await waitFor(() => {
      expect(uploadFiles).toHaveBeenCalledTimes(2)
    })
    expect(uploadFiles.mock.calls[1][0].files).toEqual([explicitFile])
  })

  it('esconde o botão quando só há falha ambígua', async () => {
    const user = userEvent.setup()
    const ambiguousFile = new File(['b'], 'b.txt', { type: 'text/plain' })
    const failure = new HubUploadError(
      'Não foi possível confirmar o envio de b.txt. Verificando se foi concluído…',
      {
        uploaded: [],
        failed: [{ file: ambiguousFile, error: new Error('rede'), ambiguous: true }],
      },
    )
    const uploadFiles = vi.fn().mockRejectedValueOnce(failure)
    setup({ uploadFiles })
    renderPage()

    await user.upload(uploadInput(), [ambiguousFile])
    expect(await screen.findByRole('alert')).toHaveTextContent('Verificando')
    expect(screen.getByRole('status')).toHaveTextContent('pode ter sido concluído')
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument()
    expect(uploadFiles).toHaveBeenCalledTimes(1)
  })
})
