import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import CustomScrollArea from '../CustomScrollArea/CustomScrollArea.jsx'
import styles from './AppOverlay.module.css'

const ease = [0.22, 1, 0.36, 1]
const backdropMotion = { duration: 0.22, ease }
const panelMotion = { duration: 0.32, ease }

export default function AppOverlay({
  title,
  children,
  onClose,
  compact = false,
  trailing = null,
  labelledBy,
  refreshKey = 'overlay',
}) {
  const generatedId = useId()
  const titleId = labelledBy ?? generatedId
  const panelRef = useRef(null)
  const [visible, setVisible] = useState(true)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  const close = useCallback(() => {
    setVisible(false)
  }, [])

  useEffect(() => {
    const previous = document.activeElement
    panelRef.current?.focus()

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [close])

  return (
    <AnimatePresence onExitComplete={() => closeRef.current?.()}>
      {visible ? (
        <motion.div
          key="app-overlay"
          className={styles.overlay}
          initial={false}
          exit={{ opacity: 0 }}
          transition={panelMotion}
        >
          <motion.button
            type="button"
            className={styles.backdrop}
            aria-hidden="true"
            tabIndex={-1}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={backdropMotion}
            onClick={close}
          />
          <motion.div
            ref={panelRef}
            className={[styles.panel, compact ? styles.compact : ''].filter(Boolean).join(' ')}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={panelMotion}
          >
            <div className={styles.chrome}>
              <h2 id={titleId}>{title}</h2>
              <div className={styles.trailing}>
                {trailing}
                <button type="button" className={styles.close} onClick={close} aria-label="Fechar">
                  <X size={16} strokeWidth={1.7} aria-hidden="true" />
                </button>
              </div>
            </div>
            <CustomScrollArea className={styles.body} refreshKey={refreshKey}>
              <div className={styles.main}>{children}</div>
            </CustomScrollArea>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export { styles as overlayStyles }
