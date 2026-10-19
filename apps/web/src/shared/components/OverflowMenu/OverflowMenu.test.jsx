import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import OverflowMenu from './OverflowMenu.jsx'

function Card({ onRename }) {
  return (
    <div data-testid="card">
      <a href="/item">Relatório</a>
      <OverflowMenu contextual label="Ações de Relatório" items={[{ id: 'rename', label: 'Renomear', onSelect: onRename }]} />
    </div>
  )
}

describe('OverflowMenu contextual', () => {
  it('não mostra o botão de três pontos', () => {
    render(<Card onRename={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Ações de Relatório' })).not.toBeInTheDocument()
  })

  it('abre com o botão direito no card e bloqueia o menu do navegador', async () => {
    const onRename = vi.fn()
    render(<Card onRename={onRename} />)

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 30, clientY: 20 })
    act(() => { screen.getByRole('link', { name: 'Relatório' }).dispatchEvent(event) })

    expect(event.defaultPrevented).toBe(true)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Renomear' }))
    expect(onRename).toHaveBeenCalledTimes(1)
  })
})
