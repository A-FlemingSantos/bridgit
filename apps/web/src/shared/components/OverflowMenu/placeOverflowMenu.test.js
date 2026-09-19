import { describe, expect, it } from 'vitest'
import { GAP, MENU_WIDTH, VIEW_PAD, placeOverflowMenu } from './placeOverflowMenu.js'

function box({ x, y, w, h }) {
  return { left: x, right: x + w, top: y, bottom: y + h, width: w, height: h }
}

describe('placeOverflowMenu', () => {
  const viewport = { viewportWidth: 1280, viewportHeight: 800, itemCount: 6, hasDanger: true }

  it('coloca o menu fora do card, no lado oposto do gatilho', () => {
    const trigger = box({ x: 244, y: 120, w: 28, h: 28 })
    const host = box({ x: 40, y: 112, w: 240, h: 180 })

    const placed = placeOverflowMenu({ trigger, host, ...viewport })

    expect(placed.left).toBe(host.right + GAP)
    expect(placed.left).toBeGreaterThanOrEqual(host.right)
    expect(placed.top).toBe(trigger.top)
    expect(placed.width).toBe(MENU_WIDTH)
  })

  it('vira para o outro lado do card quando não cabe', () => {
    const trigger = box({ x: 1236, y: 120, w: 28, h: 28 })
    const host = box({ x: 1032, y: 112, w: 240, h: 180 })

    const placed = placeOverflowMenu({ trigger, host, ...viewport })

    expect(placed.left).toBe(host.left - GAP - MENU_WIDTH)
    expect(placed.left + MENU_WIDTH).toBeLessThanOrEqual(host.left)
    expect(placed.left).toBeGreaterThanOrEqual(VIEW_PAD)
  })

  it('coloca à esquerda quando o gatilho está no lado esquerdo do card', () => {
    const trigger = box({ x: 408, y: 120, w: 28, h: 28 })
    const host = box({ x: 400, y: 112, w: 240, h: 180 })

    const placed = placeOverflowMenu({ trigger, host, ...viewport })

    expect(placed.left).toBe(host.left - GAP - MENU_WIDTH)
    expect(placed.left + MENU_WIDTH).toBeLessThanOrEqual(host.left)
  })

  it('abre ao lado do gatilho e vira se não cabe na viewport', () => {
    const leftTrigger = box({ x: 20, y: 80, w: 90, h: 36 })
    const left = placeOverflowMenu({
      trigger: leftTrigger,
      host: leftTrigger,
      ...viewport,
      itemCount: 3,
      hasDanger: false,
    })
    expect(left.left).toBe(leftTrigger.right + GAP)

    const rightTrigger = box({ x: 1120, y: 80, w: 90, h: 36 })
    const right = placeOverflowMenu({
      trigger: rightTrigger,
      host: rightTrigger,
      ...viewport,
      itemCount: 3,
      hasDanger: false,
    })
    expect(right.left).toBe(rightTrigger.left - GAP - MENU_WIDTH)
    expect(right.left).toBeGreaterThanOrEqual(VIEW_PAD)
  })

  it('abre abaixo do gatilho e vira para caber na viewport', () => {
    const trigger = box({ x: 36, y: 80, w: 90, h: 36 })
    const below = placeOverflowMenu({
      trigger,
      host: trigger,
      prefer: 'below',
      ...viewport,
      itemCount: 3,
      hasDanger: false,
    })
    expect(below.top).toBe(trigger.bottom + GAP)
    expect(below.left).toBe(trigger.left)

    const lowTrigger = box({ x: 36, y: 760, w: 90, h: 36 })
    const above = placeOverflowMenu({
      trigger: lowTrigger,
      host: lowTrigger,
      prefer: 'below',
      ...viewport,
      itemCount: 3,
      hasDanger: false,
    })
    expect(above.top + above.width).toBeDefined()
    expect(above.top + 150).toBeLessThanOrEqual(lowTrigger.top)

    const rightTrigger = box({ x: 1180, y: 80, w: 90, h: 36 })
    const flipped = placeOverflowMenu({
      trigger: rightTrigger,
      host: rightTrigger,
      prefer: 'below',
      ...viewport,
      itemCount: 3,
      hasDanger: false,
    })
    expect(flipped.left).toBe(rightTrigger.right - MENU_WIDTH)
    expect(flipped.left + MENU_WIDTH).toBeLessThanOrEqual(1280 - VIEW_PAD)
  })
})
