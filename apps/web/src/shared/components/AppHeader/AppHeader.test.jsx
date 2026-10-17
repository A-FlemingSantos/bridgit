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
  it('mostra o ícone pixel-art no botão da conta', () => {
    const { container } = renderHeader()
    const icon = container.querySelector('[aria-label="Conta"] svg')
    expect(icon).not.toBeNull()
    expect(icon.getAttribute('aria-hidden')).toBe('true')
  })
})
