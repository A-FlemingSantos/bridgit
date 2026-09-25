import { ApiClientError, apiRequest } from '@bridgit/shared-client'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PublicLinkPage from './PublicLinkPage.jsx'

vi.mock('@bridgit/shared-client', () => ({
  apiRequest: vi.fn(),
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
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({ numPages: 0 }),
    destroy: vi.fn(async () => {}),
  })),
}))

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: '/pdf.worker.min.mjs',
}))

const router = { future: { v7_startTransition: true, v7_relativeSplatPath: true } }

function renderPage(linkRef = 'relatorio-anual-abc1234567890ABCD') {
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
    apiRequest.mockReset()
  })

  it('carrega metadados e renderiza o leitor', async () => {
    apiRequest.mockResolvedValue({
      name: 'Relatorio Anual',
      mimeType: 'application/pdf',
      extension: 'pdf',
      size: 2048,
      mode: 'pdf',
      providerName: 'Google Drive',
      contentUrl: '/api/public/links/abc1234567890ABCD/content',
      readUrl: '/api/public/links/abc1234567890ABCD/content?variant=read',
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Relatorio Anual', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('2 KB')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Baixar' })).toHaveAttribute(
      'href',
      '/api/public/links/abc1234567890ABCD/content',
    )
    expect(apiRequest).toHaveBeenCalledWith('/api/public/links/abc1234567890ABCD')
    await waitFor(() => {
      expect(document.title).toBe('Relatorio Anual')
    })
  })

  it('mostra estado amigavel para link inexistente', async () => {
    apiRequest.mockRejectedValue(
      new ApiClientError('Link não encontrado.', {
        code: 'LINK_NAO_ENCONTRADO',
        status: 404,
      }),
    )

    renderPage()

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Link indisponível' })).toBeInTheDocument()
  })

  it('adiciona meta noindex enquanto montado', async () => {
    apiRequest.mockResolvedValue({
      name: 'Foto',
      mimeType: 'image/png',
      extension: 'png',
      size: 512,
      mode: 'image',
      providerName: 'Dropbox',
      contentUrl: '/api/public/links/abc1234567890ABCD/content',
      readUrl: '/api/public/links/abc1234567890ABCD/content?variant=read',
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
