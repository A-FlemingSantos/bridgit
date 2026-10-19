import { ApiClientError, getPublicLinkMetadata, listPublicLinkFolder } from '@bridgit/shared-client'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PublicLinkPage from './PublicLinkPage.jsx'

vi.mock('@bridgit/shared-client', () => ({
  getPublicLinkMetadata: vi.fn(),
  listPublicLinkFolder: vi.fn(),
  getPublicLinkItem: vi.fn(),
  parseLinkRef: (linkRef) =>
    /^[a-z0-9]+(-[a-z0-9]+)*-(?:[a-z0-9]{4}|[A-Za-z0-9]{16})$/.test(linkRef ?? '')
      ? { alias: 'x', code: 'y' }
      : null,
  ApiClientError: class ApiClientError extends Error {
    constructor(message, options = {}) {
      super(message)
      this.name = 'ApiClientError'
      this.status = options.status ?? 500
      this.code = options.code
    }
  },
}))

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  PDFDataRangeTransport: class {},
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({ numPages: 0 }),
    destroy: vi.fn(async () => {}),
  })),
}))

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: '/pdf.worker.min.mjs',
}))

const router = { future: { v7_startTransition: true, v7_relativeSplatPath: true } }

function renderPage(linkRef = 'relatorio-anual-abc1234567890ABC') {
  return render(
    <MemoryRouter {...router} initialEntries={[`/p/${linkRef}`]}>
      <Routes>
        <Route path="/p/:linkRef" element={<PublicLinkPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PublicLinkPage', () => {
  beforeEach(() => {
    document.title = 'Bridgit'
    document.head.querySelectorAll('meta[name="robots"]').forEach((node) => node.remove())
    getPublicLinkMetadata.mockReset()
    listPublicLinkFolder.mockReset()
  })

  it('carrega metadados e renderiza o leitor', async () => {
    getPublicLinkMetadata.mockResolvedValue({
      name: 'Relatorio Anual',
      mimeType: 'application/pdf',
      extension: 'pdf',
      size: 2048,
      kind: 'file',
      mode: 'pdf',
      providerName: 'Google Drive',
      contentUrl: '/api/public/links/abc1234567890ABC/content',
      readUrl: '/api/public/links/abc1234567890ABC/content?variant=read',
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Relatorio Anual', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('2 KB')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Baixar' })).toHaveAttribute(
      'href',
      '/api/public/links/abc1234567890ABC/content',
    )
    expect(getPublicLinkMetadata).toHaveBeenCalledWith('relatorio-anual-abc1234567890ABC')
    await waitFor(() => {
      expect(document.title).toBe('Relatorio Anual')
    })
  })

  it('aponta o download para VITE_API_BASE_URL quando configurado', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://bridgit-demo.duckdns.org')
    try {
      getPublicLinkMetadata.mockResolvedValue({
        name: 'Relatorio Anual',
        mimeType: 'application/pdf',
        extension: 'pdf',
        size: 2048,
        mode: 'pdf',
        providerName: 'Google Drive',
        contentUrl: '/api/public/links/abc1234567890ABC/content',
        readUrl: '/api/public/links/abc1234567890ABC/content?variant=read',
      })

      renderPage()

      expect(await screen.findByRole('link', { name: 'Baixar' })).toHaveAttribute(
        'href',
        'https://bridgit-demo.duckdns.org/api/public/links/abc1234567890ABC/content',
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('mostra estado amigavel para link inexistente', async () => {
    getPublicLinkMetadata.mockRejectedValue(
      new ApiClientError('Link não encontrado.', {
        code: 'LINK_NAO_ENCONTRADO',
        status: 404,
      }),
    )

    renderPage()

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Link indisponível' })).toBeInTheDocument()
  })

  it('oferece tentar de novo quando o arquivo esta temporariamente indisponivel', async () => {
    getPublicLinkMetadata
      .mockRejectedValueOnce(
        new ApiClientError('O arquivo nao esta disponivel agora.', {
          code: 'LINK_INDISPONIVEL',
          status: 503,
        }),
      )
      .mockResolvedValueOnce({
        name: 'Relatorio Anual',
        mimeType: 'application/pdf',
        extension: 'pdf',
        size: 2048,
        mode: 'pdf',
        providerName: 'Google Drive',
        contentUrl: '/api/public/links/abc1234567890ABC/content',
        readUrl: '/api/public/links/abc1234567890ABC/content?variant=read',
      })

    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O arquivo não está disponível agora. Tente de novo em instantes.',
    )
    expect(screen.queryByRole('heading', { name: 'Link indisponível' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))

    expect(await screen.findByRole('heading', { name: 'Relatorio Anual', level: 1 })).toBeInTheDocument()
    expect(getPublicLinkMetadata).toHaveBeenCalledTimes(2)
  })

  it('mostra mensagem propria quando ha muitos acessos', async () => {
    getPublicLinkMetadata.mockRejectedValue(
      new ApiClientError('Muitos acessos a este link.', {
        code: 'MUITOS_ACESSOS',
        status: 429,
      }),
    )

    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Muitos acessos a este link. Tente de novo em instantes.',
    )
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Link indisponível' })).not.toBeInTheDocument()
  })

  it('nao chama a API para um link com formato invalido', async () => {
    renderPage('sem-codigo-valido!')

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Link indisponível' })).toBeInTheDocument()
    expect(getPublicLinkMetadata).not.toHaveBeenCalled()
  })

  it('renderiza o navegador de pastas quando o link e uma pasta', async () => {
    getPublicLinkMetadata.mockResolvedValue({
      kind: 'folder',
      name: 'Contratos',
      providerName: 'Dropbox',
    })
    listPublicLinkFolder.mockResolvedValue({
      folder: { ref: null, name: 'Contratos' },
      path: [],
      items: [
        { ref: 'f1', name: 'Anexos', kind: 'folder', modifiedAt: null },
        { ref: 'a1', name: 'contrato.pdf', kind: 'file', mimeType: 'application/pdf', extension: 'pdf', size: 2048 },
      ],
      nextCursor: null,
    })

    renderPage('contratos-k3x9')

    expect(await screen.findByRole('heading', { name: 'Contratos', level: 1 })).toBeInTheDocument()
    expect(await screen.findByText('Anexos')).toBeInTheDocument()
    expect(screen.getByText('contrato.pdf')).toBeInTheDocument()
    expect(getPublicLinkMetadata).toHaveBeenCalledWith('contratos-k3x9')
    expect(listPublicLinkFolder).toHaveBeenCalledWith('contratos-k3x9', { folder: null })
    expect(screen.queryByRole('link', { name: 'Baixar' })).not.toBeInTheDocument()
    await waitFor(() => {
      expect(document.title).toBe('Contratos')
    })
  })

  it('mostra a pagina de link indisponivel se a pasta some enquanto navega', async () => {
    getPublicLinkMetadata.mockResolvedValue({ kind: 'folder', name: 'Contratos', providerName: 'Dropbox' })
    listPublicLinkFolder.mockRejectedValue(
      new ApiClientError('Link não encontrado.', { code: 'LINK_NAO_ENCONTRADO', status: 404 }),
    )

    renderPage('contratos-k3x9')

    expect(await screen.findByRole('heading', { name: 'Link indisponível' })).toBeInTheDocument()
  })

  it('adiciona meta noindex enquanto montado', async () => {
    getPublicLinkMetadata.mockResolvedValue({
      name: 'Foto',
      mimeType: 'image/png',
      extension: 'png',
      size: 512,
      mode: 'image',
      providerName: 'Dropbox',
      contentUrl: '/api/public/links/abc1234567890ABC/content',
      readUrl: '/api/public/links/abc1234567890ABC/content?variant=read',
    })

    const view = renderPage()

    await waitFor(() => {
      const tag = document.head.querySelector('meta[name="robots"]')
      expect(tag).not.toBeNull()
      expect(tag.getAttribute('content')).toBe('noindex, nofollow')
    })

    view.unmount()

    expect(document.head.querySelector('meta[name="robots"]')).toBeNull()
  })
})
