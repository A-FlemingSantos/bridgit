import { ApiClientError, getPublicLinkItem, listPublicLinkFolder } from '@bridgit/shared-client'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PublicFolderBrowser from './PublicFolderBrowser.jsx'

vi.mock('@bridgit/shared-client', () => ({
  getPublicLinkItem: vi.fn(),
  listPublicLinkFolder: vi.fn(),
  ApiClientError: class ApiClientError extends Error {
    constructor(message, options = {}) {
      super(message)
      this.name = 'ApiClientError'
      this.status = options.status ?? 500
      this.code = options.code
    }
  },
}))

vi.mock('../../../shared/components/FileReader/FileReader.jsx', () => ({
  default: ({ file, source, downloadUrl }) => (
    <div
      data-testid="file-reader"
      data-name={file?.name}
      data-mode={source?.mode ?? ''}
      data-url={source?.url ?? ''}
      data-download={downloadUrl ?? ''}
    />
  ),
}))

const LINK_REF = 'contratos-k3x9'
const meta = { kind: 'folder', name: 'Contratos', providerName: 'Dropbox' }
const router = { future: { v7_startTransition: true, v7_relativeSplatPath: true } }

function apiError(code, status) {
  return new ApiClientError(code, { code, status })
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>
}

function renderBrowser({ search = '', onLinkGone = vi.fn() } = {}) {
  render(
    <MemoryRouter {...router} initialEntries={[`/p/${LINK_REF}${search}`]}>
      <Routes>
        <Route
          path="/p/:linkRef"
          element={
            <>
              <PublicFolderBrowser linkRef={LINK_REF} meta={meta} onLinkGone={onLinkGone} />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
  return { onLinkGone }
}

const rootListing = {
  folder: { ref: null, name: 'Contratos' },
  path: [],
  items: [
    { ref: 'f1', name: 'Anexos', kind: 'folder', modifiedAt: null },
    {
      ref: 'a1',
      name: 'contrato.pdf',
      kind: 'file',
      mimeType: 'application/pdf',
      extension: 'pdf',
      size: 2048,
      modifiedAt: '2020-03-05T12:00:00Z',
    },
  ],
  nextCursor: null,
}

const subfolderListing = {
  folder: { ref: 'f1', name: 'Anexos' },
  path: [{ ref: null, name: 'Contratos' }],
  items: [{ ref: 'a2', name: 'nota.txt', kind: 'file', mimeType: 'text/plain', extension: 'txt', size: 10 }],
  nextCursor: null,
}

const fileItem = {
  kind: 'file',
  name: 'contrato.pdf',
  mimeType: 'application/pdf',
  extension: 'pdf',
  size: 2048,
  mode: 'pdf',
  providerName: 'Dropbox',
  contentUrl: '/api/public/links/contratos-k3x9/items/a1/content',
  readUrl: '/api/public/links/contratos-k3x9/items/a1/content?variant=read',
}

describe('PublicFolderBrowser', () => {
  beforeEach(() => {
    listPublicLinkFolder.mockReset()
    getPublicLinkItem.mockReset()
  })

  it('lista a raiz compartilhada com pastas e arquivos', async () => {
    listPublicLinkFolder.mockResolvedValue(rootListing)

    renderBrowser()

    expect(await screen.findByRole('heading', { name: 'Contratos', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Anexos/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /contrato\.pdf/ })).toBeInTheDocument()
    expect(screen.getByText(/2 KB · 5 de março de 2020/)).toBeInTheDocument()
    expect(listPublicLinkFolder).toHaveBeenCalledWith(LINK_REF, { folder: null })
    expect(screen.queryByRole('navigation', { name: 'Localização atual' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ações/ })).not.toBeInTheDocument()
  })

  it('entra numa subpasta, atualiza ?pasta e o breadcrumb', async () => {
    const user = userEvent.setup()
    listPublicLinkFolder.mockResolvedValueOnce(rootListing).mockResolvedValueOnce(subfolderListing)

    renderBrowser()

    await user.click(await screen.findByRole('link', { name: /Anexos/ }))

    expect(await screen.findByRole('heading', { name: 'Anexos', level: 1 })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(`/p/${LINK_REF}?pasta=f1`)
    expect(listPublicLinkFolder).toHaveBeenLastCalledWith(LINK_REF, { folder: 'f1' })
    expect(screen.getByText('nota.txt')).toBeInTheDocument()

    const trail = screen.getByRole('navigation', { name: 'Localização atual' })
    const rootCrumb = within(trail).getByRole('link', { name: 'Contratos' })
    expect(rootCrumb).toHaveAttribute('href', `/p/${LINK_REF}`)

    listPublicLinkFolder.mockResolvedValueOnce(rootListing)
    await user.click(rootCrumb)

    expect(await screen.findByRole('link', { name: /Anexos/ })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(new RegExp(`^/p/${LINK_REF}$`))
  })

  it('carrega a subpasta direto de ?pasta e monta o breadcrumb com os ancestrais', async () => {
    listPublicLinkFolder.mockResolvedValue({
      folder: { ref: 'f2', name: 'Fundo' },
      path: [
        { ref: null, name: 'Contratos' },
        { ref: 'f1', name: 'Anexos' },
      ],
      items: [],
      nextCursor: null,
    })

    renderBrowser({ search: '?pasta=f2' })

    expect(await screen.findByRole('heading', { name: 'Fundo', level: 1 })).toBeInTheDocument()
    expect(listPublicLinkFolder).toHaveBeenCalledWith(LINK_REF, { folder: 'f2' })
    const trail = screen.getByRole('navigation', { name: 'Localização atual' })
    expect(within(trail).getByRole('link', { name: 'Contratos' })).toHaveAttribute('href', `/p/${LINK_REF}`)
    expect(within(trail).getByRole('link', { name: 'Anexos' })).toHaveAttribute(
      'href',
      `/p/${LINK_REF}?pasta=f1`,
    )
  })

  it('carrega mais itens com o cursor', async () => {
    const user = userEvent.setup()
    listPublicLinkFolder
      .mockResolvedValueOnce({ ...rootListing, items: [rootListing.items[0]], nextCursor: 'c1' })
      .mockResolvedValueOnce({ ...rootListing, items: [rootListing.items[1]], nextCursor: null })

    renderBrowser()

    await user.click(await screen.findByRole('button', { name: 'Carregar mais' }))

    expect(await screen.findByText('contrato.pdf')).toBeInTheDocument()
    expect(screen.getByText('Anexos')).toBeInTheDocument()
    expect(listPublicLinkFolder).toHaveBeenLastCalledWith(LINK_REF, { folder: null, cursor: 'c1' })
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument()
  })

  it('recarrega a pasta da primeira pagina quando o cursor ficou velho', async () => {
    const user = userEvent.setup()
    listPublicLinkFolder
      .mockResolvedValueOnce({ ...rootListing, items: [rootListing.items[0]], nextCursor: 'c1' })
      .mockRejectedValueOnce(apiError('PASTA_ALTERADA', 409))
      .mockResolvedValueOnce({
        ...rootListing,
        items: [{ ref: 'f9', name: 'Nova', kind: 'folder' }],
        nextCursor: null,
      })

    renderBrowser()

    await user.click(await screen.findByRole('button', { name: 'Carregar mais' }))

    expect(await screen.findByText('Nova')).toBeInTheDocument()
    expect(screen.queryByText('Anexos')).not.toBeInTheDocument()
    expect(listPublicLinkFolder).toHaveBeenCalledTimes(3)
    expect(listPublicLinkFolder).toHaveBeenLastCalledWith(LINK_REF, { folder: null })
  })

  it('mostra o estado de pasta vazia', async () => {
    listPublicLinkFolder.mockResolvedValue({ ...rootListing, items: [] })

    renderBrowser()

    expect(await screen.findByText('Pasta vazia')).toBeInTheDocument()
  })

  it('abre o arquivo em ?arquivo com baixar, leitor e volta para a pasta', async () => {
    const user = userEvent.setup()
    listPublicLinkFolder.mockResolvedValueOnce(rootListing).mockResolvedValueOnce(rootListing)
    getPublicLinkItem.mockResolvedValue(fileItem)

    renderBrowser()

    await user.click(await screen.findByRole('link', { name: /contrato\.pdf/ }))

    expect(await screen.findByRole('heading', { name: 'contrato.pdf', level: 1 })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(`/p/${LINK_REF}?arquivo=a1`)
    expect(getPublicLinkItem).toHaveBeenCalledWith(LINK_REF, 'a1')
    expect(screen.getByText('2 KB')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Baixar' })).toHaveAttribute(
      'href',
      '/api/public/links/contratos-k3x9/items/a1/content',
    )
    const reader = screen.getByTestId('file-reader')
    expect(reader).toHaveAttribute('data-mode', 'pdf')
    expect(reader).toHaveAttribute('data-url', '/api/public/links/contratos-k3x9/items/a1/content?variant=read')

    await user.click(screen.getByRole('link', { name: 'Voltar para a pasta' }))

    expect(await screen.findByRole('link', { name: /Anexos/ })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(new RegExp(`^/p/${LINK_REF}$`))
  })

  it('preserva a pasta de origem ao abrir e voltar de um arquivo', async () => {
    const user = userEvent.setup()
    listPublicLinkFolder.mockResolvedValue(subfolderListing)
    getPublicLinkItem.mockResolvedValue({ ...fileItem, name: 'nota.txt' })

    renderBrowser({ search: '?pasta=f1' })

    await user.click(await screen.findByRole('link', { name: /nota\.txt/ }))
    expect(await screen.findByRole('heading', { name: 'nota.txt', level: 1 })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(`?pasta=f1&arquivo=a2`)

    await user.click(screen.getByRole('link', { name: 'Voltar para a pasta' }))
    expect(await screen.findByRole('heading', { name: 'Anexos', level: 1 })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(`/p/${LINK_REF}?pasta=f1`)
  })

  it('mostra item indisponivel dentro da pagina quando o arquivo nao existe mais', async () => {
    const user = userEvent.setup()
    listPublicLinkFolder.mockResolvedValue(rootListing)
    getPublicLinkItem.mockRejectedValue(apiError('LINK_ITEM_NAO_ENCONTRADO', 404))

    const { onLinkGone } = renderBrowser({ search: '?arquivo=zzz' })

    expect(await screen.findByRole('heading', { name: 'Item indisponível' })).toBeInTheDocument()
    expect(onLinkGone).not.toHaveBeenCalled()

    listPublicLinkFolder.mockResolvedValue(rootListing)
    await user.click(screen.getByRole('link', { name: /pasta compartilhada/ }))

    expect(await screen.findByRole('link', { name: /Anexos/ })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(new RegExp(`^/p/${LINK_REF}$`))
  })

  it('mostra item indisponivel quando a subpasta esta fora da pasta compartilhada', async () => {
    listPublicLinkFolder.mockRejectedValue(apiError('LINK_ITEM_NAO_ENCONTRADO', 404))

    const { onLinkGone } = renderBrowser({ search: '?pasta=fora' })

    expect(await screen.findByRole('heading', { name: 'Item indisponível' })).toBeInTheDocument()
    expect(onLinkGone).not.toHaveBeenCalled()
  })

  it('avisa a pagina quando o link inteiro nao existe mais', async () => {
    listPublicLinkFolder.mockRejectedValue(apiError('LINK_NAO_ENCONTRADO', 404))

    const { onLinkGone } = renderBrowser()

    await waitFor(() => {
      expect(onLinkGone).toHaveBeenCalledTimes(1)
    })
  })

  it('oferece tentar de novo quando ha muitos acessos', async () => {
    const user = userEvent.setup()
    listPublicLinkFolder
      .mockRejectedValueOnce(apiError('MUITOS_ACESSOS', 429))
      .mockResolvedValueOnce(rootListing)

    renderBrowser()

    expect(await screen.findByRole('alert')).toHaveTextContent('Muitos acessos a este link.')
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))

    expect(await screen.findByRole('link', { name: /Anexos/ })).toBeInTheDocument()
  })
})
