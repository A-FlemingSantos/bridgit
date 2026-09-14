import { useContext, useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, FilePen, FolderPlus, PenLine, Plus, Stamp, Upload } from 'lucide-react'
import { AppShellSubheaderShownContext } from '../../../../shared/components/AppShell/AppShell.jsx'
import styles from './SpaceViewActions.module.css'

const extras = [
  { id: 'upload', label: 'Enviar', icon: Upload },
  { id: 'folder', label: 'Nova pasta', icon: FolderPlus },
  { id: 'edit', label: 'Editar PDF', icon: FilePen },
  { id: 'sign-req', label: 'Pedir assinaturas', icon: Stamp },
  { id: 'sign', label: 'Assinar', icon: PenLine },
]

export default function SpaceViewActions() {
  const [open, setOpen] = useState(false)
  const extrasId = useId()
  const dockRef = useRef(null)
  const subheaderShown = useContext(AppShellSubheaderShownContext)

  useEffect(() => {
    if (!subheaderShown) setOpen(false)
  }, [subheaderShown])

  useEffect(() => {
    if (!open) return undefined

    function handlePointerDown(event) {
      if (dockRef.current?.contains(event.target)) return
      setOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  return (
    <div className={styles.dock} ref={dockRef}>
      <div className={styles.head}>
        <button type="button" className={styles.primary}>
          <Plus size={15} strokeWidth={1.6} aria-hidden="true" />
          Criar
        </button>
        <button
          type="button"
          className={styles.toggle}
          aria-label={open ? 'Recolher ações' : 'Mais ações'}
          aria-expanded={open}
          aria-controls={extrasId}
          onClick={() => setOpen((current) => !current)}
        >
          <ChevronDown
            size={16}
            strokeWidth={1.6}
            className={open ? styles.chevronOpen : styles.chevron}
            aria-hidden="true"
          />
        </button>
      </div>

      <div
        className={open ? styles.extrasOpen : styles.extras}
        id={extrasId}
        aria-hidden={!open}
      >
        <div className={styles.extrasInner}>
          {extras.map((action) => {
            const Icon = action.icon
            return (
              <button
                key={action.id}
                type="button"
                className={styles.item}
                tabIndex={open ? 0 : -1}
              >
                <Icon size={15} strokeWidth={1.6} aria-hidden="true" />
                {action.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
