import { useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Ellipsis } from 'lucide-react'
import SuspendedMenu from '../SuspendedMenu/SuspendedMenu.jsx'
import { useSuspendedMenu } from '../SuspendedMenu/useSuspendedMenu.js'
import { MENU_WIDTH, placeOverflowMenu, resolveOverflowHost } from './placeOverflowMenu.js'
import styles from './OverflowMenu.module.css'

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
      setCoords(
        placeOverflowMenu({
          trigger: trigger.getBoundingClientRect(),
          host: resolveOverflowHost(trigger).getBoundingClientRect(),
          itemCount: items.length,
          hasDanger,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        }),
      )
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
      style={coords ?? { top: -9999, left: -9999, width: MENU_WIDTH }}
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
