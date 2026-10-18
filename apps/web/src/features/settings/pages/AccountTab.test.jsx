import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import AccountTab from './AccountTab.jsx'

const sessionApi = vi.hoisted(() => ({
  user: { id: 'user-1', username: 'arthur' },
  logout: vi.fn(),
  updateUsername: vi.fn(),
}))

vi.mock('../../../shared/auth/SessionContext.jsx', () => ({
  useSession: () => ({ ...sessionApi }),
}))

const router = { future: { v7_startTransition: true, v7_relativeSplatPath: true } }

function tree() {
  return (
    <MemoryRouter {...router}>
      <AccountTab />
    </MemoryRouter>
  )
}

describe('AccountTab', () => {
  it('acompanha o usuário da sessão quando ele muda em outra aba', async () => {
    const user = userEvent.setup()
    sessionApi.user = { id: 'user-1', username: 'arthur' }
    const { rerender } = render(tree())
    expect(screen.getByText('arthur')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Editar usuário' }))
    expect(screen.getByLabelText('Usuário')).toHaveValue('arthur')

    sessionApi.user = { id: 'user-1', username: 'beatriz' }
    rerender(tree())
    expect(screen.getByText('beatriz')).toBeInTheDocument()
    expect(screen.getByLabelText('Usuário')).toHaveValue('beatriz')
  })

  it('não sobrescreve uma edição em andamento', async () => {
    const user = userEvent.setup()
    sessionApi.user = { id: 'user-1', username: 'arthur' }
    const { rerender } = render(tree())

    await user.click(screen.getByRole('button', { name: 'Editar usuário' }))
    await user.type(screen.getByLabelText('Usuário'), 'zinho')
    sessionApi.user = { id: 'user-1', username: 'beatriz' }
    rerender(tree())

    expect(screen.getByLabelText('Usuário')).toHaveValue('arthurzinho')
  })
})
