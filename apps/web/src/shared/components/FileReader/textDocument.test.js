import { describe, expect, it } from 'vitest'
import { decodeText, encodeText } from './textDocument.js'

function bytes(...parts) {
  return new Uint8Array(parts.flatMap((part) => (typeof part === 'string' ? [...new TextEncoder().encode(part)] : part))).buffer
}

describe('textDocument', () => {
  it('guarda o fim de linha do arquivo e o devolve ao salvar', () => {
    const decoded = decodeText(bytes('a\r\nb\r\nc\n'))

    expect(decoded.eol).toBe('\r\n')
    expect(encodeText('a\nb\nc\n', decoded)).toBe('a\r\nb\r\nc\r\n')
  })

  it('mantém LF quando é o fim de linha do arquivo', () => {
    const decoded = decodeText(bytes('a\nb\n'))

    expect(decoded.eol).toBe('\n')
    expect(encodeText('a\nb\n', decoded)).toBe('a\nb\n')
  })

  it('tira o BOM do texto e o devolve ao salvar', () => {
    const decoded = decodeText(bytes([0xef, 0xbb, 0xbf], 'olá'))

    expect(decoded.bom).toBe(true)
    expect(decoded.text).toBe('olá')
    expect(encodeText(decoded.text, decoded)).toBe('﻿olá')
  })

  it('marca arquivos que não são UTF-8', () => {
    expect(decodeText(bytes('ok')).utf8).toBe(true)
    expect(decodeText(bytes([0x6f, 0xe9, 0x21])).utf8).toBe(false)
  })

  it('corta acima de 2 MB', () => {
    const decoded = decodeText(new Uint8Array(2 * 1024 * 1024 + 10).fill(97).buffer)

    expect(decoded.truncated).toBe(true)
    expect(decoded.text).toHaveLength(2 * 1024 * 1024)
  })
})
