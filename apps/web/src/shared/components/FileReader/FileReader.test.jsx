import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FileReader from './FileReader.jsx'

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: vi.fn(async () => ({
        getViewport: ({ scale }) => ({ width: 100 * scale, height: 140 * scale }),
        render: () => ({ promise: Promise.resolve() }),
      })),
    }),
    destroy: vi.fn(async () => {}),
  })),
}))

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: '/pdf.worker.min.mjs',
}))

const file = {
  name: 'Relatorio',
  extension: 'pdf',
  mimeType: 'application/pdf',
  providerName: 'Google Drive',
}

describe('FileReader', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('mostra a capa e o loader enquanto source e null', () => {
    render(<FileReader file={file} source={null} error={null} downloadUrl={null} />)

    expect(screen.getByRole('status', { name: 'Carregando arquivo' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Relatorio' })).toBeInTheDocument()
    expect(screen.getByText('PDF · Google Drive')).toBeInTheDocument()
    expect(document.querySelector('[aria-hidden="true"]')).toBeTruthy()
  })

  it('mostra mensagem e download para mode none', () => {
    render(
      <FileReader
        file={file}
        source={{ mode: 'none', url: null }}
        error={null}
        downloadUrl="/download"
      />,
    )

    expect(screen.getByText('Este arquivo não tem leitura no Bridgit')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Baixar' })).toBeInTheDocument()
  })

  it('mostra erro e download quando error e informado', () => {
    render(
      <FileReader
        file={file}
        source={{ mode: 'image', url: '/read' }}
        error="Arquivo indisponível"
        downloadUrl="/download"
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Arquivo indisponível')
    expect(screen.getByRole('button', { name: 'Baixar' })).toBeInTheDocument()
  })

  it('esconde o loader depois que a imagem carrega', async () => {
    render(
      <FileReader
        file={file}
        source={{ mode: 'image', url: '/image.png' }}
        error={null}
        downloadUrl={null}
      />,
    )

    expect(screen.getByRole('status', { name: 'Carregando arquivo' })).toBeInTheDocument()

    const image = document.querySelector('img[alt="Relatorio"]')
    expect(image).toBeTruthy()
    image.dispatchEvent(new Event('load'))

    await waitFor(() => {
      expect(screen.queryByRole('status', { name: 'Carregando arquivo' })).not.toBeInTheDocument()
    })
  })

  it('renderiza texto sem interpretar HTML', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode('<strong>alert(1)</strong>').buffer,
      })),
    )

    render(
      <FileReader
        file={{ ...file, extension: 'txt' }}
        source={{ mode: 'text', url: '/text.txt' }}
        error={null}
        downloadUrl={null}
      />,
    )

    expect(await screen.findByText('<strong>alert(1)</strong>')).toBeInTheDocument()
    expect(document.querySelector('strong')).not.toBeInTheDocument()
  })
})
