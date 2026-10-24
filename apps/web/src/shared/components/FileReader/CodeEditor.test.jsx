import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CodeEditor from './CodeEditor.jsx'
import { loadLanguage } from './codeLanguages.js'

function blobOf(text) {
  return { arrayBuffer: async () => new TextEncoder().encode(text).buffer }
}

function content() {
  return document.querySelector('.cm-content')
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
    render(<CodeEditor url="/a.py" extension="py" content={blobOf('n1 = 1\r\nprint(n1)\n')} onReady={onReady} editable />)

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
    render(<CodeEditor url="/big.txt" content={{ arrayBuffer: async () => big.buffer }} editable />)

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

  it('reporta erro quando a resposta falha', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    const onError = vi.fn()
    render(<CodeEditor url="/a.txt" content={null} onError={onError} />)

    await waitFor(() => expect(onError).toHaveBeenCalledWith('Não foi possível ler este arquivo como texto.'))
  })
})
