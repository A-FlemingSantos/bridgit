import { describe, expect, it } from 'vitest'
import { contentType, fileNameFrom, safeName } from './download'

describe('fileNameFrom', () => {
  it('prefers the UTF-8 name the server sends', () => {
    const headers = { 'Content-Disposition': 'attachment; filename="Livros de Matem_tica.docx"; filename*=UTF-8\'\'Livros%20de%20Matem%C3%A1tica.docx' }
    expect(fileNameFrom(headers, 'x')).toBe('Livros de Matemática.docx')
  })

  it('falls back to the plain name, then to the item name', () => {
    expect(fileNameFrom({ 'content-disposition': 'attachment; filename="a.pdf"' }, 'x')).toBe('a.pdf')
    expect(fileNameFrom({}, 'Nota.txt')).toBe('Nota.txt')
  })

  it('removes characters a file system rejects', () => {
    expect(safeName('a/b:c?.txt')).toBe('a_b_c_.txt')
    expect(safeName('  ')).toBe('arquivo')
  })
})

describe('contentType', () => {
  it('uses the type of the bytes actually sent', () => {
    const docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    expect(contentType({ 'Content-Type': `${docx}; charset=binary` }, 'application/vnd.google-apps.document')).toBe(docx)
  })

  it('falls back to the stored type, but never a Google-native one', () => {
    expect(contentType({ 'content-type': 'application/octet-stream' }, 'application/pdf')).toBe('application/pdf')
    expect(contentType({}, 'application/vnd.google-apps.document')).toBe('*/*')
  })
})
