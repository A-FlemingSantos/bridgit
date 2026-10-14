import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import AppHeader from './AppHeader.jsx'

const sessionApi = vi.hoisted(() => ({ user: null }))

vi.mock('../../auth/SessionContext.jsx', () => ({
  useSession: () => sessionApi,
}))

const router = { future: { v7_startTransition: true, v7_relativeSplatPath: true } }

function renderHeader() {
  return render(
    <MemoryRouter {...router}>
      <AppHeader />
    </MemoryRouter>,
  )
}

describe('AppHeader', () => {
  it('mostra a inicial do usuário da sessão no avatar', () => {
    sessionApi.user = { id: 'user-1', username: 'beatriz' }
    const { container } = renderHeader()
    expect(container.querySelector('[aria-hidden="true"]:not(svg)')?.textContent).toBe('B')
  })

  it('não inventa um nome quando não há usuário', () => {
    sessionApi.user = null
    const { container } = renderHeader()
    expect(container.querySelector('[aria-label="Conta"] span')?.textContent).toBe('')
  })
})
