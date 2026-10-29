import { useContext, useId } from 'react'
import { AppShellSubheaderShownContext } from '../../../../shared/components/AppShell/AppShell.jsx'
import SuspendedMenu from '../../../../shared/components/SuspendedMenu/SuspendedMenu.jsx'
import { useSuspendedMenu } from '../../../../shared/components/SuspendedMenu/useSuspendedMenu.js'
import { PixelPlus } from '../../../../shared/components/PixelIcons/PixelIcons.jsx'
import styles from './SpaceViewActions.module.css'

export default function SpaceViewActions({
  label = 'Criar ou Enviar',
  items = [],
}) {
  const menuId = useId()
  const subheaderShown = useContext(AppShellSubheaderShownContext)
  const menu = useSuspendedMenu(items.length, { enabled: subheaderShown })
  const wrappedItems = items.map((action) => ({
    ...action,
    onSelect: () => {
      menu.closeMenu()
      action.onSelect?.()
    },
  }))

  return (
    <div className={styles.dock} ref={menu.dockRef}>
      <div className={[styles.head, menu.open || menu.closing ? styles.headOpen : ''].filter(Boolean).join(' ')}>
        <button
          type="button"
          className={styles.trigger}
          aria-haspopup="menu"
          aria-expanded={menu.open}
          aria-controls={menuId}
          onClick={() => (menu.open ? menu.closeMenu() : menu.openMenu())}
        >
          <PixelPlus size={12} />
          <span className={styles.label}>{label}</span>
        </button>
      </div>

      <SuspendedMenu
        id={menuId}
        open={menu.open}
        closing={menu.closing}
        items={wrappedItems}
        stretch
        attached
      />
    </div>
  )
}
