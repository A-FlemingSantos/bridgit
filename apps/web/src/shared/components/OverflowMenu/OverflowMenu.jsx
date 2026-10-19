import { useEffect, useId, useRef, useState } from 'react'
import { Ellipsis } from 'lucide-react'
import AnchoredSuspendedMenu from '../SuspendedMenu/AnchoredSuspendedMenu.jsx'
import { useSuspendedMenu } from '../SuspendedMenu/useSuspendedMenu.js'
import styles from './OverflowMenu.module.css'

export default function OverflowMenu({
  items,
  label = 'Mais ações',
  title = null,
  floating = false,
  hoverReveal = false,
  ghost = false,
  contextual = false,
}) {
  const extrasId = useId()
  const triggerId = useId()
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const menu = useSuspendedMenu(items.length, { menuRef })
  const { dockRef, openMenu } = menu
  // `contextual`: no trigger button; a right click (or the context menu key) on the card that holds
  // the menu opens it where the pointer is.
  const [point, setPoint] = useState(null)

  useEffect(() => {
    if (!contextual) return undefined
    const host = dockRef.current?.parentElement
    if (!host) return undefined
    function handleContextMenu(event) {
      event.preventDefault()
      const rect = host.getBoundingClientRect()
      const fromPointer = event.clientX !== 0 || event.clientY !== 0
      setPoint({
        x: fromPointer ? event.clientX - rect.left : rect.width - 8,
        y: fromPointer ? event.clientY - rect.top : 8,
        at: Date.now(),
      })
      openMenu()
    }
    host.addEventListener('contextmenu', handleContextMenu)
    return () => host.removeEventListener('contextmenu', handleContextMenu)
  }, [contextual, dockRef, openMenu])

  // Expandable items keep the menu open; their panel gets `close` to finish the choice.
  // `fill` items also keep it open, so their fill stays in view.
  const wrappedItems = items.map((item) =>
    typeof item.panel === 'function'
      ? { ...item, panel: () => item.panel({ close: menu.closeMenu }) }
      : item.fill
        ? item
        : {
            ...item,
            onSelect: () => {
              menu.closeMenu()
              item.onSelect?.()
            },
          },
  )

  if (contextual) {
    return (
      <div className={styles.contextDock} ref={dockRef}>
        <span
          id={triggerId}
          ref={triggerRef}
          className={styles.anchor}
          aria-label={label}
          style={point ? { left: point.x, top: point.y } : undefined}
        />
        {/* Kept mounted so the panel still unrolls on open; a new point only moves it. */}
        <AnchoredSuspendedMenu
          id={extrasId}
          labelledBy={triggerId}
          open={menu.open}
          closing={menu.closing}
          items={wrappedItems}
          title={title}
          triggerRef={triggerRef}
          panelRef={menuRef}
          prefer="below"
          anchorKey={point?.at ?? null}
        />
      </div>
    )
  }

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
      <AnchoredSuspendedMenu
        id={extrasId}
        labelledBy={triggerId}
        open={menu.open}
        closing={menu.closing}
        items={wrappedItems}
        title={title}
        triggerRef={triggerRef}
        panelRef={menuRef}
      />
    </div>
  )
}
