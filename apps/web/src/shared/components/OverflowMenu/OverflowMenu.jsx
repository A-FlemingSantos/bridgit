import { useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Ellipsis } from 'lucide-react'
import SuspendedMenu from '../SuspendedMenu/SuspendedMenu.jsx'
import { useSuspendedMenu } from '../SuspendedMenu/useSuspendedMenu.js'
import styles from './OverflowMenu.module.css'

const MENU_WIDTH = 168
const GAP = 4
const VIEW_PAD = 8

function itemHeight() {
  const raw = Math.min(40, Math.max(28, window.innerWidth * 0.04)) * 1.15
  return raw
}

function menuHeight(itemCount, hasDanger) {
  const n = Math.max(itemCount, 1)
  return n * itemHeight() + (n - 1) * 4 + 4 + (hasDanger ? 4 : 0)
}

function placeMenu(trigger, itemCount, hasDanger) {
  const rect = trigger.getBoundingClientRect()
  const height = menuHeight(itemCount, hasDanger)
  const vw = window.innerWidth
  const vh = window.innerHeight

  const fitsAfter = rect.right + GAP + MENU_WIDTH <= vw - VIEW_PAD
  const fitsBefore = rect.left - GAP - MENU_WIDTH >= VIEW_PAD
  const afterLeft = rect.right + GAP
  const beforeLeft = rect.left - GAP - MENU_WIDTH

  let left = afterLeft
  if (!fitsAfter && fitsBefore) left = beforeLeft
  else if (!fitsAfter && !fitsBefore) {
    left = Math.max(VIEW_PAD, Math.min(afterLeft, vw - VIEW_PAD - MENU_WIDTH))
  }

  let top = rect.top
  if (top + height > vh - VIEW_PAD) {
    top = rect.bottom - height
  }
  top = Math.max(VIEW_PAD, Math.min(top, vh - VIEW_PAD - height))

  return { top, left, width: MENU_WIDTH }
}

export default function OverflowMenu({
  items,
  label = 'Mais ações',
  floating = false,
  hoverReveal = false,
  ghost = false,
}) {
  const extrasId = useId()
  const triggerId = useId()
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const menu = useSuspendedMenu(items.length, { menuRef })
  const [coords, setCoords] = useState(null)
  const visible = menu.open || menu.closing
  const hasDanger = items.some((item) => item.danger)

  useLayoutEffect(() => {
    if (!visible) return undefined

    function update() {
      const trigger = triggerRef.current
      if (!trigger) return
      setCoords(placeMenu(trigger, items.length, hasDanger))
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [visible, items.length, hasDanger])

  const wrappedItems = items.map((item) => ({
    ...item,
    onSelect: () => {
      menu.closeMenu()
      item.onSelect?.()
    },
  }))

  const panel = (
    <SuspendedMenu
      id={extrasId}
      labelledBy={triggerId}
      open={menu.open}
      closing={menu.closing}
      items={wrappedItems}
      panelRef={menuRef}
      anchored
      style={coords ?? { top: 0, left: 0, width: MENU_WIDTH }}
    />
  )

  return (
    <div
      className={[
        styles.dock,
        floating ? styles.floating : styles.inline,
      ]
        .filter(Boolean)
        .join(' ')}
      ref={menu.dockRef}
    >
      <button
        type="button"
        id={triggerId}
        ref={triggerRef}
        className={[
          styles.trigger,
          ghost ? styles.ghost : '',
          hoverReveal ? styles.hoverReveal : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-controls={extrasId}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          menu.toggleMenu()
        }}
      >
        <Ellipsis size={16} strokeWidth={1.6} aria-hidden="true" />
      </button>
      {typeof document === 'undefined' ? panel : createPortal(panel, document.body)}
    </div>
  )
}
