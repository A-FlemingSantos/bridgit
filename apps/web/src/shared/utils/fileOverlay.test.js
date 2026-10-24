import { describe, expect, it } from 'vitest'
import { fileNavState, isFilePath, resolveFileBackground, resolvePageLocation } from './fileOverlay.js'

const FILE = '/drives/conn-1/file/f1'

describe('fileNavState', () => {
  it('guarda a página de origem para o arquivo abrir por cima dela', () => {
    const state = fileNavState({ pathname: '/drives/conn-1', search: '?q=1' })

    expect(resolveFileBackground({ pathname: FILE, state })).toEqual({
      pathname: '/drives/conn-1',
      search: '?q=1',
      hash: '',
      state: null,
    })
  })

  it('mantém o fundo ao trocar de arquivo com o overlay aberto', () => {
    const state = { backgroundLocation: { pathname: '/home', search: '', hash: '', state: null } }

    expect(fileNavState({ pathname: FILE, state })).toBe(state)
  })

  it('abre página própria quando a origem é outro arquivo ou as configurações', () => {
    expect(fileNavState({ pathname: '/settings/providers' })).toBeNull()
    expect(fileNavState({ pathname: FILE })).toBeNull()
  })
})

describe('resolveFileBackground', () => {
  it('ignora fundo ausente ou que não seja uma página comum', () => {
    expect(resolveFileBackground({ pathname: FILE, state: null })).toBeNull()
    expect(resolveFileBackground({ pathname: FILE, state: { backgroundLocation: { pathname: FILE } } })).toBeNull()
    expect(resolveFileBackground({ pathname: '/home', state: { backgroundLocation: { pathname: '/x' } } })).toBeNull()
  })
})

describe('resolvePageLocation', () => {
  it('enxerga através do arquivo e das configurações', () => {
    const background = { pathname: '/home', search: '', hash: '', state: null }

    expect(resolvePageLocation({ pathname: FILE, state: { backgroundLocation: background } })).toBe(background)
    expect(resolvePageLocation({ pathname: '/settings', state: { backgroundLocation: background } })).toBe(background)
    expect(resolvePageLocation({ pathname: '/home' }).pathname).toBe('/home')
  })
})

describe('isFilePath', () => {
  it('reconhece só o arquivo de uma conta; o caminho antigo por provedor só redireciona', () => {
    expect(isFilePath('/drives/conn-1/file/f1')).toBe(true)
    expect(isFilePath('/drives/conn-1')).toBe(false)
    expect(isFilePath('/drives/conn-1/folder/f1')).toBe(false)
    expect(isFilePath('/providers/onedrive/file/f1')).toBe(false)
  })
})
