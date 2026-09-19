export const MENU_WIDTH = 168
export const GAP = 4
export const VIEW_PAD = 8

export function itemHeight(viewportWidth) {
  return Math.min(40, Math.max(28, viewportWidth * 0.04)) * 1.15
}

export function menuHeight(itemCount, hasDanger, viewportWidth) {
  const n = Math.max(itemCount, 1)
  return n * itemHeight(viewportWidth) + (n - 1) * 4 + 4 + (hasDanger ? 4 : 0)
}

export function resolveOverflowHost(trigger) {
  return trigger.parentElement?.parentElement ?? trigger
}

export function placeOverflowMenu({
  trigger,
  host,
  itemCount,
  hasDanger,
  viewportWidth,
  viewportHeight,
}) {
  const triggerRect = trigger
  const hostRect = host ?? triggerRect
  const height = menuHeight(itemCount, hasDanger, viewportWidth)

  const triggerMid = triggerRect.left + triggerRect.width / 2
  const hostMid = hostRect.left + hostRect.width / 2
  const preferAfter = triggerMid >= hostMid

  const outerRight = Math.max(triggerRect.right, hostRect.right)
  const outerLeft = Math.min(triggerRect.left, hostRect.left)
  const afterLeft = outerRight + GAP
  const beforeLeft = outerLeft - GAP - MENU_WIDTH

  const fitsAfter = afterLeft + MENU_WIDTH <= viewportWidth - VIEW_PAD
  const fitsBefore = beforeLeft >= VIEW_PAD

  let left
  if (preferAfter) {
    if (fitsAfter) left = afterLeft
    else if (fitsBefore) left = beforeLeft
    else {
      left = Math.max(VIEW_PAD, Math.min(afterLeft, viewportWidth - VIEW_PAD - MENU_WIDTH))
    }
  } else if (fitsBefore) {
    left = beforeLeft
  } else if (fitsAfter) {
    left = afterLeft
  } else {
    left = Math.max(VIEW_PAD, Math.min(beforeLeft, viewportWidth - VIEW_PAD - MENU_WIDTH))
  }

  let top = triggerRect.top
  if (top + height > viewportHeight - VIEW_PAD) {
    top = triggerRect.bottom - height
  }
  top = Math.max(VIEW_PAD, Math.min(top, viewportHeight - VIEW_PAD - height))

  return { top, left, width: MENU_WIDTH }
}
