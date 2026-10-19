import { describe, expect, it } from 'vitest'
import { addressSuffix, aliasPreview, checkAliasDraft, linkErrorMessage, linkExplanation, linkTitle } from './publicLinkSheet'

describe('aliasPreview', () => {
  it('normalizes accents, case and separators', () => {
    expect(aliasPreview('  Relatório Final 2026! ')).toBe('relatorio-final-2026')
  })

  it('is empty when nothing usable is typed', () => {
    expect(aliasPreview('***')).toBe('')
  })
})

describe('checkAliasDraft', () => {
  it('allows saving a changed, valid draft', () => {
    expect(checkAliasDraft('Meu Link', 'abc')).toEqual({ alias: 'meu-link', error: null, changed: true, canSave: true })
  })

  it('treats a draft that normalizes to the current alias as unchanged', () => {
    const result = checkAliasDraft('ABC', 'abc')
    expect(result.changed).toBe(false)
    expect(result.canSave).toBe(false)
    expect(result.error).toBeNull()
  })

  it('rejects an empty draft', () => {
    const result = checkAliasDraft('   ', 'abc')
    expect(result.canSave).toBe(false)
    expect(result.error).toBe('Digite um apelido.')
  })

  it('rejects an alias over the limit', () => {
    const result = checkAliasDraft('a'.repeat(61), 'abc')
    expect(result.canSave).toBe(false)
    expect(result.error).toContain('60')
    expect(checkAliasDraft('a'.repeat(60), 'abc').canSave).toBe(true)
  })
})

describe('linkErrorMessage', () => {
  it('maps the server codes', () => {
    expect(linkErrorMessage({ code: 'APELIDO_INDISPONIVEL' })).toContain('em uso')
    expect(linkErrorMessage({ code: 'APELIDO_INVALIDO' })).toContain('letras')
    expect(linkErrorMessage({ code: 'LINK_NAO_ENCONTRADO' })).toContain('não existe')
  })

  it('returns null for anything else', () => {
    expect(linkErrorMessage({ code: 'OUTRO' })).toBeNull()
    expect(linkErrorMessage(null)).toBeNull()
  })
})

describe('labels', () => {
  it('titles by kind', () => {
    expect(linkTitle('folder')).toBe('Pasta pública')
    expect(linkTitle('file')).toBe('Link público')
  })

  it('explains folders as browsable and read-only', () => {
    expect(linkExplanation('folder')).toContain('subpastas')
  })

  it('builds the code suffix', () => {
    expect(addressSuffix('k3x9')).toBe('-k3x9')
    expect(addressSuffix('')).toBe('')
  })
})
