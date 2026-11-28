import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import AppHeader from './AppHeader.jsx'

const router = { future: { v7_startTransition: true, v7_relativeSplatPath: true } }

function renderHeader(props = {}) {
  return render(
    <MemoryRouter {...router} initialEntries={['/home?x=1']}>
      <AppHeader {...props} />
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

  it('alterna entre Arquivos e Fotos', async () => {
    const user = userEvent.setup()
    renderHeader()

    const arquivos = screen.getByRole('button', { name: 'Arquivos' })
    const fotos = screen.getByRole('button', { name: 'Fotos' })
    expect(arquivos).toHaveAttribute('aria-pressed', 'true')
    expect(fotos).toHaveAttribute('aria-pressed', 'false')

    await user.click(fotos)
    expect(arquivos).toHaveAttribute('aria-pressed', 'false')
    expect(fotos).toHaveAttribute('aria-pressed', 'true')

    await user.click(arquivos)
    expect(arquivos).toHaveAttribute('aria-pressed', 'true')
    expect(fotos).toHaveAttribute('aria-pressed', 'false')
  })
})
