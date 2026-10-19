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

  it('preenche um item `fill` ao acioná-lo e esvazia se a ação falhar', async () => {
    const user = userEvent.setup()
    let fail
    const onSelect = vi.fn(() => new Promise((_, reject) => { fail = reject }))
    render(
      <SuspendedMenu
        id="menu"
        open
        closing={false}
        items={[{ id: 'link', label: 'Link público', fill: true, onSelect }]}
      />,
    )

    const item = screen.getByRole('menuitem', { name: 'Link público' })
    expect(item.className).not.toMatch(/itemFilled/)

    await user.click(item)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(item.className).toMatch(/itemFilled/)

    fail(new Error('falhou'))
    await vi.waitFor(() => expect(item.className).not.toMatch(/itemFilled/))
  })

  it('esvazia o item `fill` depois que a ação termina, sem fechar o menu', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn().mockResolvedValue(undefined)
    render(
      <SuspendedMenu
        id="menu"
        open
        closing={false}
        items={[{ id: 'link', label: 'Link público', fill: true, onSelect }]}
      />,
    )

    const item = screen.getByRole('menuitem', { name: 'Link público' })
    await user.click(item)
    expect(item.className).toMatch(/itemFilled/)

    await vi.waitFor(() => expect(item.className).toMatch(/itemFading/))
    await vi.waitFor(() => expect(item.className).not.toMatch(/itemFilled/))
    expect(screen.getByRole('menuitem', { name: 'Link público' })).toBeInTheDocument()
  })
})
