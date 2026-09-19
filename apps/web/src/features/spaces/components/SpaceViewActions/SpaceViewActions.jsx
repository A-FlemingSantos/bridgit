import { useContext, useId } from 'react'
import { ChevronDown, FilePen, FolderPlus, PenLine, Plus, Stamp, Upload } from 'lucide-react'
import { AppShellSubheaderShownContext } from '../../../../shared/components/AppShell/AppShell.jsx'
import SuspendedMenu from '../../../../shared/components/SuspendedMenu/SuspendedMenu.jsx'
import { useSuspendedMenu } from '../../../../shared/components/SuspendedMenu/useSuspendedMenu.js'
import styles from './SpaceViewActions.module.css'

const defaultExtras = [
  { id: 'upload', label: 'Enviar', icon: Upload },
  { id: 'folder', label: 'Nova pasta', icon: FolderPlus },
  { id: 'edit', label: 'Editar PDF', icon: FilePen },
  { id: 'sign-req', label: 'Pedir assinaturas', icon: Stamp },
  { id: 'sign', label: 'Assinar', icon: PenLine },
]

export default function SpaceViewActions({
  onCreate,
  createLabel = 'Criar',
  extras = defaultExtras,
}) {
  const extrasId = useId()
  const subheaderShown = useContext(AppShellSubheaderShownContext)
  const menu = useSuspendedMenu(extras.length, { enabled: subheaderShown })
  const wrappedExtras = extras.map((action) => ({
    ...action,
    onSelect: () => {
      menu.closeMenu()
      action.onSelect?.()
    },
  }))

  return (
    <div className={styles.dock} ref={menu.dockRef}>
      <div className={styles.head}>
        <button type="button" className={styles.primary} onClick={onCreate}>
          <Plus size={15} strokeWidth={1.6} aria-hidden="true" />
          {createLabel}
        </button>
        <button
          type="button"
          className={styles.toggle}
          aria-label={menu.open ? 'Recolher ações' : 'Mais ações'}
          aria-expanded={menu.open}
          aria-controls={extrasId}
          onClick={() => (menu.open ? menu.closeMenu() : menu.openMenu())}
        >
          <ChevronDown
            size={16}
            strokeWidth={1.6}
            className={menu.open ? styles.chevronOpen : styles.chevron}
            aria-hidden="true"
          />
        </button>
      </div>

      <SuspendedMenu
        id={extrasId}
        open={menu.open}
        closing={menu.closing}
        items={wrappedExtras}
        stretch
      />
    </div>
  )
}
