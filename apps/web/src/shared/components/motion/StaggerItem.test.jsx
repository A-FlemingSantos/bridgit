import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import StaggerItem from './StaggerItem.jsx'
import { STAGGER_LIMIT } from './stagger.js'

describe('StaggerItem', () => {
  it('mantém o mesmo elemento quando o índice cruza o limite da animação', () => {
    const { container, rerender } = render(
      <StaggerItem index={STAGGER_LIMIT - 1}><span>tile</span></StaggerItem>,
    )
    const before = container.firstChild

    rerender(<StaggerItem index={STAGGER_LIMIT}><span>tile</span></StaggerItem>)
    expect(container.firstChild).toBe(before)

    rerender(<StaggerItem index={STAGGER_LIMIT - 1}><span>tile</span></StaggerItem>)
    expect(container.firstChild).toBe(before)
  })
})
