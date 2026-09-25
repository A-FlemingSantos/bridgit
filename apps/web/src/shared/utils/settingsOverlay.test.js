import { describe, expect, it } from 'vitest'
import { resolveSettingsBackground, settingsNavState } from './settingsOverlay.js'

describe('settingsNavState', () => {
  it('preenche search e hash vazios quando só o pathname é informado', () => {
    const state = settingsNavState({ pathname: '/home' })
    const background = resolveSettingsBackground({ state })

    expect(background).toEqual({ pathname: '/home', search: '', hash: '', state: null })
    expect(`${background.pathname}${background.search}${background.hash}`).toBe('/home')
  })
})
