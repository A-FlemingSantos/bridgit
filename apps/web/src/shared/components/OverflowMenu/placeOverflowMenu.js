export const MENU_WIDTH = 220
export const GAP = 4
export const VIEW_PAD = 8

// Mirrors SuspendedMenu.module.css: 6px padding + 1px border on each side,
// 34px items 2px apart, a 9px divider before destructive items and a 35px title.
const ITEM_HEIGHT = 34
const ITEM_GAP = 2
const PANEL_CHROME = 14
const DIVIDER_HEIGHT = 9
const TITLE_HEIGHT = 35

export function menuHeight(itemCount, hasDanger, hasTitle = false) {
  const n = Math.max(itemCount, 1)
  return PANEL_CHROME
    + n * ITEM_HEIGHT
    + (n - 1) * ITEM_GAP
    + (hasDanger && n > 1 ? DIVIDER_HEIGHT + ITEM_GAP : 0)
    + (hasTitle ? TITLE_HEIGHT : 0)
}

export function resolveOverflowHost(trigger) {
  return trigger.parentElement?.parentElement ?? trigger
}

export function placeOverflowMenu({
  trigger,
  host,
  itemCount,
  hasDanger,
  hasTitle = false,
  viewportWidth,
  viewportHeight,
  prefer = 'beside',
}) {
  const triggerRect = trigger
  const hostRect = host ?? triggerRect
  const height = menuHeight(itemCount, hasDanger, hasTitle)

  if (prefer === 'below') {
    let left = triggerRect.left
    if (left + MENU_WIDTH > viewportWidth - VIEW_PAD) {
      left = triggerRect.right - MENU_WIDTH
    }
    left = Math.max(VIEW_PAD, Math.min(left, viewportWidth - VIEW_PAD - MENU_WIDTH))

    let top = triggerRect.bottom + GAP
    if (top + height > viewportHeight - VIEW_PAD) {
      top = triggerRect.top - GAP - height
    }
    top = Math.max(VIEW_PAD, Math.min(top, viewportHeight - VIEW_PAD - height))

    return { top, left, width: MENU_WIDTH }
  }

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
