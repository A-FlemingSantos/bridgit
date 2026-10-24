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

// The file and its controls say so themselves (data-overlay-surface); a press anywhere else is on blank space.
const SURFACE = '[data-overlay-surface]'
// A click that moved further than this between press and release was a drag.
const CLICK_SLOP_PX = 6

function isBlank(element) {
  return element instanceof Element && !element.closest(SURFACE)
}

// An open file, shown over the main view only: the sidebar and the rail stay as they are.
// It mounts inside the shell's main area (`data-overlay-host`); a page without a shell gets the whole window.
// `onBeforeClose` may hold the overlay open: it resolves false to stay (an edit that couldn't be saved yet).
export default function FileOverlay({ title, meta, actions, children, onClose, onBeforeClose, refreshKey }) {
  const { state } = useHub()
  const titleId = useId()
  const rootRef = useRef(null)
  const [host, setHost] = useState(undefined)
  const [visible, setVisible] = useState(true)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const beforeCloseRef = useRef(onBeforeClose)
  beforeCloseRef.current = onBeforeClose
  const closingRef = useRef(false)
  const pressRef = useRef(null)
  const blockedRef = useRef(false)
  blockedRef.current = Boolean(state.overlay)

  useLayoutEffect(() => {
    setHost(document.querySelector('[data-overlay-host]'))
  }, [])

  const close = useCallback(async () => {
    if (closingRef.current) return
    closingRef.current = true
    try {
      if ((await beforeCloseRef.current?.()) === false) return
      setVisible(false)
    } finally {
      closingRef.current = false
    }
  }, [])

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
              // Closing takes a press and a release on blank space, in the same spot: a selection that ends
              // there, or a drag that started on the file, leaves it open.
              onPointerDown: (event) => {
                pressRef.current = isBlank(event.target) ? { x: event.clientX, y: event.clientY } : null
              },
              onClick: (event) => {
                const press = pressRef.current
                pressRef.current = null
                if (!press || !isBlank(event.target)) return
                if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > CLICK_SLOP_PX) return
                close()
              },
            }}
          >
            <motion.div
              className={styles.content}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={rise}
            >
              <header className={styles.bar}>
                <div className={styles.heading} data-overlay-surface="">
                  <h2 id={titleId} className={styles.title}>
                    {title}
                  </h2>
                  {meta ? <p className={styles.meta}>{meta}</p> : null}
                </div>
                <div className={styles.tools} data-overlay-surface="">
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
