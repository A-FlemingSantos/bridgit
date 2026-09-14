import { useCallback, useContext, useEffect, useId, useRef, useState } from 'react'
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

const STAGGER_START_MS = 48
const STAGGER_STEP_MS = 36
const ITEM_MOTION_MS = 220
const STAGGER_CLOSE_MS =
  STAGGER_START_MS + STAGGER_STEP_MS * (extras.length - 1) + ITEM_MOTION_MS

function extrasPanelClassName(open, closing) {
  if (open) return `${styles.extras} ${styles.extrasOpen}`
  if (closing) return `${styles.extras} ${styles.extrasClosing}`
  return styles.extras
}

export default function SpaceViewActions() {
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const extrasId = useId()
  const dockRef = useRef(null)
  const closeTimeoutRef = useRef(null)
  const subheaderShown = useContext(AppShellSubheaderShownContext)

  const clearCloseTimeout = useCallback(() => {
    if (closeTimeoutRef.current === null) return
    window.clearTimeout(closeTimeoutRef.current)
    closeTimeoutRef.current = null
  }, [])

  const finishClose = useCallback(() => {
    clearCloseTimeout()
    setClosing(false)
  }, [clearCloseTimeout])

  const closeMenu = useCallback(() => {
    clearCloseTimeout()
    setOpen(false)

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) {
      setClosing(false)
      return
    }

    setClosing(true)
    closeTimeoutRef.current = window.setTimeout(finishClose, STAGGER_CLOSE_MS)
  }, [clearCloseTimeout, finishClose])

  const openMenu = useCallback(() => {
    clearCloseTimeout()
    setClosing(false)
    setOpen(true)
  }, [clearCloseTimeout])

  const menuVisible = open || closing

  useEffect(() => {
    if (!subheaderShown) closeMenu()
  }, [subheaderShown, closeMenu])

  useEffect(() => {
    if (!open) return undefined

    function handlePointerDown(event) {
      if (dockRef.current?.contains(event.target)) return
      closeMenu()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open, closeMenu])

  useEffect(() => () => clearCloseTimeout(), [clearCloseTimeout])

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
          onClick={() => (open ? closeMenu() : openMenu())}
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
        className={extrasPanelClassName(open, closing)}
        id={extrasId}
        aria-hidden={!menuVisible}
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
