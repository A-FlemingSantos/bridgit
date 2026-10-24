import { describe, expect, it } from 'vitest'
import { colorIdOf, migrateLegacyColors, withColor } from './folderColorKeys'

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

describe('migrateLegacyColors', () => {
  const oldestOf = (provider) => ({ onedrive: 'od-1', 'google-drive': 'gd-1' })[provider] ?? null

  it('moves provider keys to the oldest connection and keeps connection keys that already exist', () => {
    const colors = { 'onedrive:a': 'sage', 'onedrive:b': 'clay', 'od-1:b': 'plum', 'gd-9:c': 'moss' }

    expect(migrateLegacyColors(colors, oldestOf)).toEqual({ 'od-1:a': 'sage', 'od-1:b': 'plum', 'gd-9:c': 'moss' })
  })

  it('leaves the colors of a provider without connections for later, and returns null when nothing moves', () => {
    expect(migrateLegacyColors({ 'dropbox:a': 'sage' }, oldestOf)).toBeNull()
    expect(migrateLegacyColors({ 'od-1:a': 'sage' }, oldestOf)).toBeNull()
  })
})