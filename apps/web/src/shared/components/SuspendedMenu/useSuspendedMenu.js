import { useCallback, useEffect, useRef, useState } from 'react'

// The panel unrolls from its top edge as one piece; keep in sync with SuspendedMenu.module.css.
export const MENU_OPEN_MS = 260
export const MENU_CLOSE_MS = 180

export function extrasPanelClassName(styles, open, closing) {
  if (open) return `${styles.extras} ${styles.extrasOpen}`
  if (closing) return `${styles.extras} ${styles.extrasClosing}`
  return styles.extras
}

export function useSuspendedMenu(itemCount, { enabled = true, menuRef = null } = {}) {
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const dockRef = useRef(null)
  const closeTimeoutRef = useRef(null)

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

    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) {
      setClosing(false)
      return
    }

    setClosing(true)
    closeTimeoutRef.current = window.setTimeout(finishClose, MENU_CLOSE_MS)
  }, [clearCloseTimeout, finishClose])

  const openMenu = useCallback(() => {
    clearCloseTimeout()
    setClosing(false)
    setOpen(true)
  }, [clearCloseTimeout])

  const toggleMenu = useCallback(() => {
    if (open) closeMenu()
    else openMenu()
  }, [open, closeMenu, openMenu])

  const menuVisible = open || closing

  useEffect(() => {
    if (!enabled && open) closeMenu()
  }, [enabled, open, closeMenu])

  useEffect(() => {
    if (!open) return undefined

    function handlePointerDown(event) {
      if (dockRef.current?.contains(event.target)) return
      if (menuRef?.current?.contains(event.target)) return
      closeMenu()
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMenu()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, closeMenu, menuRef])

  useEffect(() => () => clearCloseTimeout(), [clearCloseTimeout])

  return {
    open,
    closing,
    menuVisible,
    dockRef,
    openMenu,
    closeMenu,
    toggleMenu,
  }
}
