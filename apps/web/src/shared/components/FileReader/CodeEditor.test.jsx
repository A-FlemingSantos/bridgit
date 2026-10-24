import { EditorView } from '@codemirror/view'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CodeEditor from './CodeEditor.jsx'
import { loadLanguage } from './codeLanguages.js'

function blobOf(text) {
  return { arrayBuffer: async () => new TextEncoder().encode(text).buffer }
}

function content() {
  return document.querySelector('.cm-content')
}

async function editorView() {
  await waitFor(() => expect(document.querySelector('.cm-editor')).toBeTruthy())
  return EditorView.findFromDOM(document.querySelector('.cm-editor'))
}

describe('loadLanguage', () => {
  it('carrega a gramática pela extensão e deixa o resto como texto puro', async () => {
    expect(await loadLanguage('PY')).toBeTruthy()
    expect(await loadLanguage('kt')).toBeTruthy()
    expect(await loadLanguage('txt')).toBeNull()
    expect(await loadLanguage(undefined)).toBeNull()
  })
})

describe('CodeEditor', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('abre o texto no editor, com números de linha, e avisa quando está pronto', async () => {
    const onReady = vi.fn()
    render(<CodeEditor url="/a.py" extension="py" content={blobOf('n1 = 1\r\nprint(n1)\n')} onReady={onReady} editable onSave={vi.fn()} />)

    await waitFor(() => expect(onReady).toHaveBeenCalled())
    expect(content().textContent).toContain('n1 = 1')
    expect(document.querySelector('.cm-lineNumbers')).toBeTruthy()
    expect(content()).toHaveAttribute('contenteditable', 'true')
  })

  it('mostra HTML do arquivo como texto', async () => {
    render(<CodeEditor url="/a.html" content={blobOf('<strong>x</strong>')} />)

    expect(await screen.findByText('<strong>x</strong>')).toBeInTheDocument()
    expect(document.querySelector('strong')).toBeNull()
  })

  it('só lê quando não é editável', async () => {
    render(<CodeEditor url="/a.py" content={blobOf('x = 1')} editable={false} />)

    await waitFor(() => expect(content()).toHaveAttribute('contenteditable', 'false'))
  })

  it('só lê e avisa quando mostra só os primeiros 2 MB', async () => {
    const big = new Uint8Array(2 * 1024 * 1024 + 10).fill(97)
    render(<CodeEditor url="/big.txt" content={{ arrayBuffer: async () => big.buffer }} editable onSave={vi.fn()} />)

    expect(await screen.findByRole('status')).toHaveTextContent('Exibindo os primeiros 2 MB do arquivo, só para leitura.')
    await waitFor(() => expect(content()).toHaveAttribute('contenteditable', 'false'))
  })

  it('espera o conteúdo do cache em vez de ir à rede', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<CodeEditor url="/a.txt" content={null} deferNetwork />)

    await Promise.resolve()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('só lê sem quem salve', async () => {
    render(<CodeEditor url="/a.py" content={blobOf('x = 1')} editable />)

    await waitFor(() => expect(content()).toHaveAttribute('contenteditable', 'false'))
  })

  it('salva o texto editado com Ctrl+S, no formato do arquivo', async () => {
    const onSave = vi.fn().mockResolvedValue({ revision: 'r2' })
    const onSaveStatusChange = vi.fn()
    render(
      <CodeEditor
        url="/a.py"
        content={blobOf('a = 1\r\n')}
        editable
        baseRevision="r1"
        fileName="a.py"
        onSave={onSave}
        onSaveStatusChange={onSaveStatusChange}
      />,
    )
    const view = await editorView()

    act(() => view.dispatch({ changes: { from: 0, to: 1, insert: 'b' } }))
    fireEvent.keyDown(window, { key: 's', ctrlKey: true })

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const attempt = onSave.mock.calls[0][0]
    expect(attempt.baseRevision).toBe('r1')
    expect(attempt.overwrite).toBe(false)
    expect(attempt.file.name).toBe('a.py')
    expect(await attempt.file.text()).toBe('b = 1\r\n')
    await waitFor(() => expect(onSaveStatusChange).toHaveBeenLastCalledWith(expect.objectContaining({ label: 'Salvo' })))
  })

  it('no conflito oferece recarregar ou sobrescrever', async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('alterado'), { status: 409, code: 'ARQUIVO_ALTERADO' }))
      .mockResolvedValueOnce({ revision: 'r3' })
    const onReload = vi.fn()
    render(<CodeEditor url="/a.py" content={blobOf('a')} editable onSave={onSave} onReload={onReload} />)
    const view = await editorView()

    act(() => view.dispatch({ changes: { from: 1, insert: 'b' } }))
    fireEvent.keyDown(window, { key: 's', ctrlKey: true })

    expect(await screen.findByRole('alert')).toHaveTextContent('O arquivo foi alterado na nuvem.')
    fireEvent.click(screen.getByRole('button', { name: 'Sobrescrever mesmo assim' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
    expect(onSave.mock.calls[1][0].overwrite).toBe(true)
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('reporta erro quando a resposta falha', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    const onError = vi.fn()
    render(<CodeEditor url="/a.txt" content={null} onError={onError} />)

    await waitFor(() => expect(onError).toHaveBeenCalledWith('Não foi possível ler este arquivo como texto.'))
  })
})
