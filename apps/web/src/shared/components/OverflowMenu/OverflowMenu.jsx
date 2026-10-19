import { useId, useRef } from 'react'
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
}) {
  const extrasId = useId()
  const triggerId = useId()
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const menu = useSuspendedMenu(items.length, { menuRef })

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
