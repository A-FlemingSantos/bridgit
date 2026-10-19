import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiClientError } from '@bridgit/shared-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HubOverlays from './HubOverlays.jsx'

const fixture = vi.hoisted(() => ({
  state: { overlay: null },
  closeOverlay: vi.fn(),
  dispatch: vi.fn(),
  actions: {
    getPublicLink: vi.fn(),
    enablePublicLink: vi.fn(),
    disablePublicLink: vi.fn(),
    updatePublicLink: vi.fn(),
  },
}))
vi.mock('./HubState.jsx', () => ({ useHub: () => fixture }))
vi.mock('../hub/index.js', () => ({
  useHubActions: () => fixture.actions,
  useProviders: () => ({ providers: [] }),
}))

const link = {
  url: 'https://bridgit.test/p/relatorio-ab12',
  alias: 'relatorio',
  code: 'ab12',
  kind: 'file',
  suffix: 'relatorio-ab12',
}

function show(overlay = {}) {
  fixture.state.overlay = {
    type: 'public-link',
    kind: 'file',
    providerId: 'onedrive',
    ref: 'ref-1',
    name: 'Relatório.pdf',
    ...overlay,
  }
  return render(<HubOverlays />)
}

function apiError(code, status = 400) {
  return new ApiClientError('Falhou', { code, status })
}

describe('PublicLinkOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fixture.actions.getPublicLink.mockResolvedValue(link)
  })

  it('titles the dialog by kind', async () => {
    fixture.actions.getPublicLink.mockResolvedValue({})
    const { unmount } = show()
    expect(await screen.findByText('Link público', { selector: 'h2' })).toBeInTheDocument()
    unmount()
    show({ kind: 'folder', name: 'Docs' })
    expect(await screen.findByText('Pasta pública', { selector: 'h2' })).toBeInTheDocument()
    expect(screen.getByText(/navegar pela pasta e pelas subpastas, só para leitura/)).toBeInTheDocument()
  })

  it('shows the alias field with the fixed code and keeps Salvar disabled while unchanged', async () => {
    show()
    const input = await screen.findByLabelText('Apelido')
    expect(input).toHaveValue('relatorio')
    expect(screen.getByText('-ab12')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
    expect(screen.getByText(/endereço antigo deixa de funcionar/)).toBeInTheDocument()
  })

  it('previews the normalized alias and saves it, updating the shown address', async () => {
    const user = userEvent.setup()
    fixture.actions.updatePublicLink.mockResolvedValue({
      ...link,
      url: 'https://bridgit.test/p/meu-novo-link-ab12',
      alias: 'meu-novo-link',
    })
    show()
    const input = await screen.findByLabelText('Apelido')
    await user.clear(input)
    await user.type(input, 'Meu Novo Link')
    expect(screen.getByText(/…\/p\/meu-novo-link-ab12/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(fixture.actions.updatePublicLink).toHaveBeenCalledWith({
      providerId: 'onedrive',
      ref: 'ref-1',
      alias: 'meu-novo-link',
    })
    expect(await screen.findByLabelText('Endereço')).toHaveValue('https://bridgit.test/p/meu-novo-link-ab12')
    expect(screen.getByLabelText('Apelido')).toHaveValue('meu-novo-link')
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
  })

  it('blocks invalid and too long aliases locally', async () => {
    const user = userEvent.setup()
    show()
    const input = await screen.findByLabelText('Apelido')
    await user.clear(input)
    await user.type(input, '!!!')
    expect(screen.getByRole('alert')).toHaveTextContent('Apelido inválido')
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()

    await user.clear(input)
    await user.click(input)
    await user.paste('a'.repeat(61))
    expect(screen.getByRole('alert')).toHaveTextContent('no máximo 60')
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
    expect(fixture.actions.updatePublicLink).not.toHaveBeenCalled()
  })

  it.each([
    ['APELIDO_INDISPONIVEL', 409, 'já está em uso'],
    ['APELIDO_INVALIDO', 400, 'Apelido inválido'],
  ])('maps %s to a field error and keeps the address', async (code, status, text) => {
    const user = userEvent.setup()
    fixture.actions.updatePublicLink.mockRejectedValue(apiError(code, status))
    show()
    const input = await screen.findByLabelText('Apelido')
    await user.clear(input)
    await user.type(input, 'outro')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(text)
    expect(screen.getByLabelText('Endereço')).toHaveValue(link.url)
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled()
  })
})
