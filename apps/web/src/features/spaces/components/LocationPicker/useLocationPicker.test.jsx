import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLocationPicker } from './useLocationPicker.jsx'

vi.mock('../../../../shared/hub/index.js', () => ({
  useFolder: vi.fn(),
  useProviders: vi.fn(),
}))

vi.mock('../../../../shared/state/HubState.jsx', () => ({
  useHub: () => ({ state: { providers: [] } }),
}))

import { useFolder, useProviders } from '../../../../shared/hub/index.js'

const PROVIDERS = [{ id: 'onedrive', name: 'OneDrive' }]

function folderStub(overrides = {}) {
  return {
    status: 'ready',
    folder: { ref: null, name: 'OneDrive', ancestry: [] },
    items: [],
    nextCursor: null,
    hasMore: false,
    isFetchingNextPage: false,
    loadMore: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn(),
    ...overrides,
  }
}

let stubs = {}

function setupStubs(next) {
  stubs = next
  useFolder.mockImplementation((providerId, folderRef) => stubs[folderRef ?? 'root'] ?? folderStub())
}

function Picker(props) {
  const picker = useLocationPicker({ source: 'api', initialProviderId: 'onedrive', ...props })
  return (
    <>
      {picker.body}
      {picker.trailing}
    </>
  )
}

describe('useApiLocationPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useProviders.mockReturnValue({ providers: PROVIDERS })
    setupStubs({ root: folderStub() })
  })

  it('avança páginas enquanto não há pastas e mostra vazio só no fim', async () => {
    const loadMore = vi.fn().mockResolvedValue(undefined)
    setupStubs({
      root: folderStub({
        items: [{ kind: 'file', ref: 'file-1', name: 'Nota.txt' }],
        nextCursor: 'c1',
        hasMore: true,
        loadMore,
      }),
    })
    render(<Picker allowRoot onChoose={vi.fn()} resetKey="pagina" />)

    await waitFor(() => {
      expect(loadMore).toHaveBeenCalled()
    })
    expect(screen.queryByText('Esta pasta está vazia.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Carregar mais' })).toBeInTheDocument()

    setupStubs({
      root: folderStub({
        items: [
          { kind: 'file', ref: 'file-1', name: 'Nota.txt' },
          { kind: 'folder', ref: 'folder-b', name: 'Destino' },
        ],
        nextCursor: null,
        hasMore: false,
      }),
    })
    render(<Picker allowRoot onChoose={vi.fn()} resetKey="pagina-2" />)
    expect(await screen.findByRole('button', { name: /Destino/ })).toBeInTheDocument()
  })

  it('mostra "Esta pasta está vazia." quando a listagem esgota', () => {
    setupStubs({ root: folderStub({ items: [], nextCursor: null, hasMore: false }) })
    render(<Picker allowRoot onChoose={vi.fn()} resetKey="vazia" />)
    expect(screen.getByText('Esta pasta está vazia.')).toBeInTheDocument()
  })

  it('mostra erro e nova tentativa quando a continuação falha', async () => {
    const user = userEvent.setup()
    const loadMore = vi.fn().mockRejectedValue(new Error('rede'))
    setupStubs({
      root: folderStub({
        items: [{ kind: 'file', ref: 'file-1', name: 'Nota.txt' }],
        nextCursor: 'c1',
        hasMore: true,
        loadMore,
      }),
    })
    render(<Picker allowRoot onChoose={vi.fn()} resetKey="erro" />)

    expect(await screen.findByRole('alert')).toHaveTextContent('mais pastas')
    const retry = screen.getByRole('button', { name: 'Tentar novamente' })
    await user.click(retry)
    expect(loadMore.mock.calls.length).toBeGreaterThan(1)
  })

  it('encontra destino só na última página', async () => {
    const loadMore = vi.fn().mockImplementation(async () => {
      setupStubs({
        root: folderStub({
          items: [{ kind: 'folder', ref: 'folder-z', name: 'Fundo' }],
          nextCursor: null,
          hasMore: false,
        }),
      })
    })
    setupStubs({
      root: folderStub({
        items: [{ kind: 'file', ref: 'file-1', name: 'Nota.txt' }],
        nextCursor: 'c1',
        hasMore: true,
        loadMore,
      }),
    })
    const onChoose = vi.fn()
    const view = render(<Picker allowRoot onChoose={onChoose} resetKey="fundo" />)

    expect(await screen.findByRole('button', { name: /Fundo/ })).toBeInTheDocument()
    view.unmount()
  })

  it('não escolhe subpasta sem metadados e escolhe após nova tentativa', async () => {
    const user = userEvent.setup()
    const onChoose = vi.fn()
    setupStubs({
      root: folderStub({
        items: [{ kind: 'folder', ref: 'folder-a', name: 'Pasta A' }],
        nextCursor: null,
        hasMore: false,
      }),
      'folder-a': {
        ...folderStub({ status: 'error', folder: null, items: [] }),
        reload: vi.fn(),
      },
    })
    const view = render(<Picker allowRoot onChoose={onChoose} resetKey="destino" />)

    await user.click(await screen.findByRole('button', { name: /Pasta A/ }))

    const choose = screen.getByRole('button', { name: 'Escolher' })
    expect(choose).toBeDisabled()
    await user.click(choose)
    expect(onChoose).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    setupStubs({
      root: folderStub({
        items: [{ kind: 'folder', ref: 'folder-a', name: 'Pasta A' }],
        nextCursor: null,
        hasMore: false,
      }),
      'folder-a': folderStub({
        folder: { ref: 'folder-a', name: 'Pasta A', ancestry: [] },
        items: [],
        nextCursor: null,
        hasMore: false,
      }),
    })
    view.rerender(<Picker allowRoot onChoose={onChoose} resetKey="destino" />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Escolher' })).toBeEnabled()
    })
    await user.click(screen.getByRole('button', { name: 'Escolher' }))
    expect(onChoose).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'folder', ref: 'folder-a' }),
    )
  })

  it('permite raiz validada sem cair nela em silêncio', async () => {
    const user = userEvent.setup()
    const onChoose = vi.fn()
    setupStubs({ root: folderStub({ items: [], nextCursor: null, hasMore: false }) })
    render(<Picker allowRoot onChoose={onChoose} resetKey="raiz" />)
    const choose = screen.getByRole('button', { name: 'Escolher' })
    expect(choose).toBeEnabled()
    await user.click(choose)
    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ providerId: 'onedrive' }))
  })
})
