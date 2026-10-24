import { describe, expect, it } from 'vitest'
import { colorIdOf, withColor } from './folderColorKeys'

describe('colorIdOf', () => {
  const colors = { 'c1:r': 'sage', 'google:r': 'clay', 'google:old': 'plum' }

  it('prefers the connection key', () => {
    expect(colorIdOf(colors, 'c1', 'r', 'google')).toBe('sage')
  })

  it('falls back to the legacy provider key only when allowed', () => {
    expect(colorIdOf(colors, 'c1', 'old', 'google')).toBe('plum')
    expect(colorIdOf(colors, 'c2', 'old', null)).toBeUndefined()
  })
})

describe('withColor', () => {
  it('sets the connection key and drops the legacy one', () => {
    expect(withColor({ 'google:r': 'clay' }, 'c1', 'r', 'sage', 'carbon', 'google')).toEqual({ 'c1:r': 'sage' })
  })

  it('clears the default color, including a legacy value that would show through', () => {
    expect(withColor({ 'google:r': 'clay', 'c1:r': 'sage' }, 'c1', 'r', 'carbon', 'carbon', 'google')).toEqual({})
  })

  it('leaves other accounts of the provider alone', () => {
    expect(withColor({ 'c2:r': 'moss' }, 'c1', 'r', 'sage', 'carbon', null)).toEqual({ 'c2:r': 'moss', 'c1:r': 'sage' })
  })
})
