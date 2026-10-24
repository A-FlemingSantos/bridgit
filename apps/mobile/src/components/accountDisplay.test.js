import { describe, expect, it } from 'vitest'
import { accountInitials, accountLabels, accountLine } from './accountDisplay'

describe('accountInitials', () => {
  it('uses the first letters of the first two words of the name', () => {
    expect(accountInitials({ name: 'maria  souza lima', email: 'm@x.com' })).toBe('MS')
    expect(accountInitials({ name: 'Arthur' })).toBe('A')
  })

  it('falls back to the email, then the provider', () => {
    expect(accountInitials({ email: 'zed@x.com' })).toBe('Z')
    expect(accountInitials({ providerName: 'Dropbox' })).toBe('D')
    expect(accountInitials({})).toBe('?')
  })
})

describe('accountLabels', () => {
  it('shows the name over the email', () => {
    expect(accountLabels({ providerName: 'Dropbox', account: { name: 'Ana', email: 'a@x.com' } }))
      .toEqual({ title: 'Ana', subtitle: 'a@x.com' })
  })

  it('uses the email as title and the provider underneath when there is no name', () => {
    expect(accountLabels({ providerName: 'Dropbox', account: { email: 'a@x.com' } }))
      .toEqual({ title: 'a@x.com', subtitle: 'Dropbox' })
  })

  it('falls back to the provider name', () => {
    expect(accountLabels({ providerName: 'Dropbox' })).toEqual({ title: 'Dropbox', subtitle: '' })
    expect(accountLabels(null)).toEqual({ title: 'Conta', subtitle: '' })
  })
})

describe('accountLine', () => {
  it('prefers the email', () => {
    expect(accountLine({ account: { name: 'Ana', email: 'a@x.com' } })).toBe('a@x.com')
    expect(accountLine({ account: { name: 'Ana' } })).toBe('Ana')
    expect(accountLine({})).toBe('Conectado')
  })
})
