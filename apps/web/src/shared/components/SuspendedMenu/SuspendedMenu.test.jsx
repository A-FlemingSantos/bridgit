import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import SuspendedMenu from './SuspendedMenu.jsx'

describe('SuspendedMenu', () => {
  it('abre o painel de um item acoplado ao lado, sem acionar o item', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <SuspendedMenu
        id="menu"
        open
        closing={false}
        items={[
          { id: 'rename', label: 'Renomear', onSelect },
          { id: 'color', label: 'Cor da pasta', swatch: '#4a4a4a', panel: () => <p>Paleta</p> },
        ]}
      />,
    )

    const trigger = screen.getByRole('menuitem', { name: 'Cor da pasta' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Paleta')).not.toBeInTheDocument()

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Paleta')).toBeInTheDocument()
    expect(onSelect).not.toHaveBeenCalled()

    await user.click(trigger)
    expect(screen.queryByText('Paleta')).not.toBeInTheDocument()
  })
})
