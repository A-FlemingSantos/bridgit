import { describe, expect, it } from 'vitest'
import { resolveConnectionId } from './resolveConnectionId'

const connections = [
  { connectionId: 'a', providerId: 'onedrive' },
  { connectionId: 'b', providerId: 'google-drive' },
  { connectionId: 'c', providerId: 'google-drive' },
]

describe('resolveConnectionId', () => {
  it('trusts a route that names its account', () => {
    expect(resolveConnectionId(connections, { connectionId: 'c', providerId: 'google-drive' })).toBe('c')
    expect(resolveConnectionId([], { connectionId: 'x' })).toBe('x')
  })

  it('falls back to the oldest account of the provider', () => {
    expect(resolveConnectionId(connections, { providerId: 'google-drive' })).toBe('b')
  })

  it('has no account for an unknown provider or empty params', () => {
    expect(resolveConnectionId(connections, { providerId: 'dropbox' })).toBeNull()
    expect(resolveConnectionId(connections, {})).toBeNull()
    expect(resolveConnectionId(undefined)).toBeNull()
  })
})
