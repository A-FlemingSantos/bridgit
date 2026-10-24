import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AccountAvatar from './AccountAvatar.jsx'
import { accountInitials } from './initials.js'
import { clearConnectionAvatarCache } from './useConnectionAvatar.js'

const actions = vi.hoisted(() => ({ getConnectionAvatar: vi.fn() }))

vi.mock('../../hub/index.js', () => ({
  useHubActions: () => actions,
}))

const connection = {
  connectionId: 'conn-1',
  provider: 'google-drive',
  providerName: 'Google Drive',
  generation: 1,
  account: { name: 'Ana Souza', email: 'ana@example.com' },
}

let urlCounter = 0

beforeEach(() => {
  urlCounter = 0
  actions.getConnectionAvatar.mockReset()
  globalThis.URL.createObjectURL = vi.fn(() => `blob:avatar-${++urlCounter}`)
  globalThis.URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  clearConnectionAvatarCache()
})

describe('accountInitials', () => {
  it('uses the name, then the email local part', () => {
    expect(accountInitials({ name: 'Ana Maria Souza', email: 'x@y.com' })).toBe('AS')
    expect(accountInitials({ name: 'ana', email: 'x@y.com' })).toBe('A')
    expect(accountInitials({ name: null, email: 'joao.silva@y.com' })).toBe('JS')
    expect(accountInitials(null)).toBe('')
  })
})

describe('AccountAvatar', () => {
  it('shows the photo when the account has one, with the provider badge', async () => {
    actions.getConnectionAvatar.mockResolvedValue(new Blob(['x'], { type: 'image/png' }))
    const { container } = render(<AccountAvatar connection={connection} size={24} />)

    await waitFor(() => expect(container.querySelector('img[src="blob:avatar-1"]')).not.toBeNull())
    expect(actions.getConnectionAvatar).toHaveBeenCalledWith('conn-1', 1)
    expect(screen.getByTestId('account-avatar-badge').querySelector('img')).not.toBeNull()
  })

  it('falls back to initials when the account has no photo, and does not ask again', async () => {
    actions.getConnectionAvatar.mockRejectedValue(Object.assign(new Error('sem foto'), { status: 404 }))
    const first = render(<AccountAvatar connection={connection} />)

    await waitFor(() => expect(actions.getConnectionAvatar).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('AS')).toBeInTheDocument()
    first.unmount()

    render(<AccountAvatar connection={connection} />)
    expect(await screen.findByText('AS')).toBeInTheDocument()
    expect(actions.getConnectionAvatar).toHaveBeenCalledTimes(1)
  })

  it('falls back to initials when the photo is unavailable, and asks again on the next mount', async () => {
    actions.getConnectionAvatar.mockRejectedValue(Object.assign(new Error('indisponível'), { status: 503 }))
    const first = render(<AccountAvatar connection={connection} />)

    await waitFor(() => expect(actions.getConnectionAvatar).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('AS')).toBeInTheDocument()
    first.unmount()

    render(<AccountAvatar connection={connection} />)
    expect(await screen.findByText('AS')).toBeInTheDocument()
    await waitFor(() => expect(actions.getConnectionAvatar).toHaveBeenCalledTimes(2))
  })

  it('shares one request between avatars of the same account and generation', async () => {
    actions.getConnectionAvatar.mockResolvedValue(new Blob(['x']))
    const { container } = render(
      <>
        <AccountAvatar connection={connection} />
        <AccountAvatar connection={connection} />
      </>,
    )

    await waitFor(() => expect(container.querySelectorAll('img[src="blob:avatar-1"]')).toHaveLength(2))
    expect(actions.getConnectionAvatar).toHaveBeenCalledTimes(1)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  })

  it('fetches again and revokes the old photo when the generation changes', async () => {
    actions.getConnectionAvatar.mockResolvedValue(new Blob(['x']))
    const { container, rerender } = render(<AccountAvatar connection={connection} />)
    await waitFor(() => expect(container.querySelector('img[src="blob:avatar-1"]')).not.toBeNull())

    rerender(<AccountAvatar connection={{ ...connection, generation: 2 }} />)
    await waitFor(() => expect(container.querySelector('img[src="blob:avatar-2"]')).not.toBeNull())

    expect(actions.getConnectionAvatar).toHaveBeenLastCalledWith('conn-1', 2)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:avatar-1')
  })
})
