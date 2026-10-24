import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CodeReader, { splitLines } from './CodeReader.jsx'

function blobOf(text) {
  return { arrayBuffer: async () => new TextEncoder().encode(text).buffer }
}

function gutter() {
  return document.querySelector('[data-code-gutter]')
}

function body() {
  return document.querySelector('[data-code-body]')
}

describe('splitLines', () => {
  it('normaliza CRLF e CR e não conta a quebra final como linha', () => {
    expect(splitLines('a\r\nb\rc\n')).toEqual(['a', 'b', 'c'])
  })

  it('mantém linhas vazias no meio e um arquivo vazio como uma linha', () => {
    expect(splitLines('a\n\nb')).toEqual(['a', '', 'b'])
    expect(splitLines('')).toEqual([''])
    expect(splitLines('\n')).toEqual([''])
  })
})

describe('CodeReader', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('numera cada linha ao lado do código, com os números fora da leitura', async () => {
    const onReady = vi.fn()
    render(<CodeReader url="/a.py" content={blobOf('n1 = 1\r\nn2 = 2\n\nprint(n1)\n')} onReady={onReady} />)

    await waitFor(() => expect(onReady).toHaveBeenCalled())
    expect(gutter().textContent).toBe('1\n2\n3\n4')
    expect(gutter()).toHaveAttribute('aria-hidden', 'true')
    expect(body().textContent).toBe('n1 = 1\nn2 = 2\n\nprint(n1)')
  })

  it('mostra HTML do arquivo como texto', async () => {
    render(<CodeReader url="/a.html" content={blobOf('<strong>x</strong>')} />)

    expect(await screen.findByText('<strong>x</strong>')).toBeInTheDocument()
    expect(document.querySelector('strong')).toBeNull()
  })

  it('avisa quando mostra só os primeiros 2 MB', async () => {
    const big = new Uint8Array(2 * 1024 * 1024 + 10).fill(97)
    render(<CodeReader url="/big.txt" content={{ arrayBuffer: async () => big.buffer }} />)

    expect(await screen.findByRole('status')).toHaveTextContent('Exibindo os primeiros 2 MB do arquivo.')
  })

  it('espera o conteúdo do cache em vez de ir à rede', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<CodeReader url="/a.txt" content={null} deferNetwork />)

    await Promise.resolve()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reporta erro quando a resposta falha', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    const onError = vi.fn()
    render(<CodeReader url="/a.txt" content={null} onError={onError} />)

    await waitFor(() => expect(onError).toHaveBeenCalledWith('Não foi possível ler este arquivo como texto.'))
  })
})
