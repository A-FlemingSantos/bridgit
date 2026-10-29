import { EditorView } from '@codemirror/view'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FileReader from './FileReader.jsx'

// jsdom has no canvas to draw the minimap on.
vi.mock('@replit/codemirror-minimap', () => ({ showMinimap: { compute: () => [] } }))

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  PDFDataRangeTransport: class {},
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

  it('no modo editorial deixa nome e meta para a pagina e rotula a regiao pelo nome', () => {
    render(<FileReader file={file} source={null} error={null} variant="editorial" />)

    expect(screen.queryByRole('heading', { name: 'Relatorio' })).toBeNull()
    expect(screen.queryByText('PDF · Google Drive')).toBeNull()
    expect(screen.getByRole('region', { name: 'Relatorio' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Carregando arquivo' })).toBeInTheDocument()
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

  it('com erro e retry mostra so Tentar novamente, sem Baixar', () => {
    render(
      <FileReader
        file={file}
        source={null}
        error="Não foi possível concluir a operação solicitada."
        onDownload={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Baixar' })).toBeNull()
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

  it('carrega texto no editor de código só com o loader, sem a capa de folha', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))

    render(
      <FileReader
        file={{ ...file, extension: 'py' }}
        source={{ mode: 'text', url: '/codigo.py' }}
        error={null}
        downloadUrl={null}
        variant="editorial"
        viewer
      />,
    )

    expect(screen.getByRole('status', { name: 'Carregando arquivo' })).toBeInTheDocument()
    expect(document.querySelector('svg')).toBeNull()
    expect(document.querySelector('[data-code-editor]')).toBeTruthy()
  })

  it('edita no app e só lê no link público', async () => {
    const text = () => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode('x = 1').buffer })
    vi.stubGlobal('fetch', vi.fn(async () => text()))

    const view = render(
      <FileReader
        file={{ ...file, extension: 'py' }}
        source={{ mode: 'text', url: '/a.py', editable: true, revision: 'r1' }}
        variant="editorial"
        onSaveContent={vi.fn()}
      />,
    )
    await waitFor(() => expect(document.querySelector('.cm-content')).toHaveAttribute('contenteditable', 'true'))
    view.unmount()

    render(<FileReader file={{ ...file, extension: 'py' }} source={{ mode: 'text', url: '/b.py', editable: true }} />)
    await waitFor(() => expect(document.querySelector('.cm-content')).toHaveAttribute('contenteditable', 'false'))
  })

  it('abre markdown em Visualizar e passa o modo e o atalho ao editor', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode('# Oi').buffer })))
    const onToggleSourceView = vi.fn()
    const props = { file: { ...file, name: 'a.md', extension: 'md' }, source: { mode: 'text', url: '/a.md', editable: true, revision: 'r1' } }

    const view = render(<FileReader {...props} variant="editorial" onSaveContent={vi.fn()} onToggleSourceView={onToggleSourceView} />)
    await waitFor(() => expect(document.querySelector('.cm-content')).toHaveAttribute('aria-label', 'Texto do arquivo'))
    expect(document.querySelector('.cm-lineNumbers')).toBeNull()
    view.rerender(<FileReader {...props} variant="editorial" onSaveContent={vi.fn()} onToggleSourceView={onToggleSourceView} sourceView />)
    await waitFor(() => expect(document.querySelector('.cm-lineNumbers')).toBeTruthy())
    view.unmount()

    // A public link passes neither: Visualizar, read only.
    render(<FileReader {...props} source={{ mode: 'text', url: '/b.md' }} />)
    await waitFor(() => expect(document.querySelector('.cm-content')).toHaveAttribute('aria-label', 'Texto do arquivo'))
    expect(document.querySelector('.cm-content')).toHaveAttribute('contenteditable', 'false')
  })

  it('só lê quando o servidor não libera a edição', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode('x').buffer })))

    render(
      <FileReader
        file={{ ...file, extension: 'py' }}
        source={{ mode: 'text', url: '/c.py', editable: false }}
        variant="editorial"
        onSaveContent={vi.fn()}
      />,
    )
    await waitFor(() => expect(document.querySelector('.cm-content')).toHaveAttribute('contenteditable', 'false'))
  })

  it('mantém o editor depois de salvar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode('x = 1').buffer })))
    const onSaveContent = vi.fn().mockResolvedValue({ revision: 'r2' })

    render(
      <FileReader
        file={{ ...file, name: 'd.py', extension: 'py' }}
        source={{ mode: 'text', url: '/d.py', editable: true, revision: 'r1' }}
        variant="editorial"
        onSaveContent={onSaveContent}
      />,
    )
    await waitFor(() => expect(document.querySelector('.cm-content')).toHaveAttribute('contenteditable', 'true'))
    const editor = document.querySelector('.cm-editor')
    const view = EditorView.findFromDOM(editor)

    act(() => view.dispatch({ changes: { from: 0, insert: '#' } }))
    fireEvent.keyDown(window, { key: 's', ctrlKey: true })

    await waitFor(() => expect(onSaveContent).toHaveBeenCalledTimes(1))
    expect(document.querySelector('.cm-editor')).toBe(editor)
    expect(document.querySelector('.cm-content').textContent).toContain('#x = 1')
  })

  it('mantém o leitor de mídia e o tempo ao renovar URL da mesma revisão', () => {
    const view = render(
      <FileReader
        file={{ ...file, extension: 'mp4', mimeType: 'video/mp4' }}
        source={{ mode: 'video', url: '/primeiro.mp4', revision: 'r-1' }}
        error={null}
        downloadUrl={null}
      />,
    )

    const video = document.querySelector('video')
    video.currentTime = 24

    view.rerender(
      <FileReader
        file={{ ...file, extension: 'mp4', mimeType: 'video/mp4' }}
        source={{ mode: 'video', url: '/renovado.mp4', revision: 'r-1' }}
        error={null}
        downloadUrl={null}
      />,
    )

    expect(document.querySelector('video')).toBe(video)
    video.dispatchEvent(new Event('loadeddata'))
    expect(video.currentTime).toBe(24)
  })
})
