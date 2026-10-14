import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SecurityTab from './SecurityTab.jsx'

const sessionApi = vi.hoisted(() => ({
  session: { session: { persistent: true } },
  changePassword: vi.fn(),
  deleteAccount: vi.fn(),
  listSessions: vi.fn(),
  revokeOtherSessions: vi.fn(),
  setPersistent: vi.fn(),
}))

vi.mock('../../../shared/auth/SessionContext.jsx', () => ({
  useSession: () => sessionApi,
}))

const router = { future: { v7_startTransition: true, v7_relativeSplatPath: true } }

const sessions = [
  { id: 's1', browser: 'Chrome', device: 'Windows', lastSeenAt: '2026-10-01T10:00:00Z', current: true },
  { id: 's2', browser: 'Firefox', device: 'Linux', lastSeenAt: '2026-09-30T10:00:00Z', current: false },
]

function renderTab() {
  return render(
    <MemoryRouter {...router}>
      <SecurityTab />
    </MemoryRouter>,
  )
}

describe('SecurityTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionApi.listSessions.mockResolvedValue(sessions)
  })

  it('destaca a sessão atual na lista', async () => {
    renderTab()

    const items = await screen.findAllByRole('listitem')
    expect(within(items[0]).getByText('Sessão atual')).toBeInTheDocument()
    expect(within(items[1]).queryByText('Sessão atual')).not.toBeInTheDocument()
  })

  it('mostra o erro da senha só no cartão da senha', async () => {
    const user = userEvent.setup()
    renderTab()
    await screen.findAllByRole('listitem')

    await user.type(screen.getByLabelText('Senha atual'), 'antiga123')
    await user.type(screen.getByLabelText('Nova senha'), 'nova12345')
    await user.type(screen.getByLabelText('Confirmar senha'), 'outra12345')
    await user.click(screen.getByRole('button', { name: 'Salvar senha' }))

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('As senhas não coincidem.')
    expect(alert.closest('form')).not.toBeNull()
    expect(sessionApi.changePassword).not.toHaveBeenCalled()
  })

  it('mostra o erro de encerrar sessões junto da ação, fora do cartão da senha', async () => {
    const user = userEvent.setup()
    sessionApi.revokeOtherSessions.mockRejectedValue(new Error('falha'))
    renderTab()
    await screen.findAllByRole('listitem')

    await user.click(screen.getByRole('button', { name: 'Encerrar outras sessões' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Não foi possível encerrar as outras sessões.')
    expect(alert.closest('form')).toBeNull()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('mostra o erro de lembrar dispositivo fora do cartão da senha', async () => {
    const user = userEvent.setup()
    sessionApi.setPersistent.mockRejectedValue(new Error('falha'))
    renderTab()
    await screen.findAllByRole('listitem')

    await user.click(screen.getByRole('switch', { name: 'Manter este dispositivo' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Não foi possível atualizar a sessão.')
    expect(alert.closest('form')).toBeNull()
  })

  it('mostra o erro de excluir conta junto da ação', async () => {
    const user = userEvent.setup()
    sessionApi.deleteAccount.mockRejectedValue(new Error('falha'))
    renderTab()
    await screen.findAllByRole('listitem')

    await user.click(screen.getByRole('button', { name: 'Excluir conta' }))
    await user.type(screen.getByLabelText('Confirme com sua senha'), 'minha-senha')
    await user.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível excluir a conta.')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(sessionApi.deleteAccount).toHaveBeenCalledWith('minha-senha')
  })

  it('volta o rótulo de encerrar depois de um tempo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    sessionApi.revokeOtherSessions.mockResolvedValue(undefined)
    renderTab()
    await screen.findAllByRole('listitem')

    await user.click(screen.getByRole('button', { name: 'Encerrar outras sessões' }))
    expect(await screen.findByRole('button', { name: 'Encerradas' })).toBeInTheDocument()

    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(screen.getByRole('button', { name: 'Encerrar outras sessões' })).toBeInTheDocument()
  })
})
