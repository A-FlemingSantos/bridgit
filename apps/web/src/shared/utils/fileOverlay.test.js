import { describe, expect, it } from 'vitest'
import { fileNavState, resolveFileBackground, resolvePageLocation } from './fileOverlay.js'

const FILE = '/providers/onedrive/file/f1'

describe('fileNavState', () => {
  it('guarda a página de origem para o arquivo abrir por cima dela', () => {
    const state = fileNavState({ pathname: '/providers/onedrive', search: '?q=1' })

    expect(resolveFileBackground({ pathname: FILE, state })).toEqual({
      pathname: '/providers/onedrive',
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
