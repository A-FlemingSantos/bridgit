import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import CustomScrollArea from '../../../../shared/components/CustomScrollArea/CustomScrollArea.jsx'
import { PixelClose } from '../../../../shared/components/PixelIcons/PixelIcons.jsx'
import { useHub } from '../../../../shared/state/HubState.jsx'
import styles from './FileOverlay.module.css'

const ease = [0.22, 1, 0.36, 1]
const fade = { duration: 0.22, ease }
const rise = { duration: 0.32, ease }

// An open file, shown over the main view only: the sidebar and the rail stay as they are.
// It mounts inside the shell's main area (`data-overlay-host`); a page without a shell gets the whole window.
export default function FileOverlay({ title, meta, actions, children, onClose, refreshKey }) {
  const { state } = useHub()
  const titleId = useId()
  const rootRef = useRef(null)
  const [host, setHost] = useState(undefined)
  const [visible, setVisible] = useState(true)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const blockedRef = useRef(false)
  blockedRef.current = Boolean(state.overlay)

  useLayoutEffect(() => {
    setHost(document.querySelector('[data-overlay-host]'))
  }, [])

  const close = useCallback(() => setVisible(false), [])

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      // A dialog or menu opened from the file closes first.
      if (blockedRef.current || rootRef.current?.querySelector('[aria-expanded="true"]')) return
      event.preventDefault()
      close()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close])

  if (host === undefined) return null

  const overlay = (
    <AnimatePresence onExitComplete={() => closeRef.current?.()}>
      {visible ? (
        <motion.div
          key="file-overlay"
          ref={rootRef}
          className={[styles.overlay, host ? '' : styles.window].filter(Boolean).join(' ')}
          role="dialog"
          aria-labelledby={titleId}
          initial={false}
          exit={{ opacity: 0 }}
          transition={rise}
        >
          <motion.div
            className={styles.backdrop}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
          />
          <CustomScrollArea
            className={styles.scroll}
            refreshKey={refreshKey}
            viewportProps={{
              onClick: (event) => {
                if (event.target === event.currentTarget) close()
              },
            }}
          >
            <motion.div
              className={styles.content}
              onClick={(event) => {
                if (event.target === event.currentTarget || event.target.hasAttribute('data-dismiss')) close()
              }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={rise}
            >
              <header className={styles.bar}>
                <div className={styles.heading}>
                  <h2 id={titleId} className={styles.title}>
                    {title}
                  </h2>
                  {meta ? <p className={styles.meta}>{meta}</p> : null}
                </div>
                <div className={styles.tools}>
                  {actions}
                  <button type="button" className={styles.close} onClick={close} aria-label="Fechar">
                    <PixelClose size={24} />
                  </button>
                </div>
              </header>
              {children}
            </motion.div>
          </CustomScrollArea>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )

  return createPortal(overlay, host ?? document.body)
}
