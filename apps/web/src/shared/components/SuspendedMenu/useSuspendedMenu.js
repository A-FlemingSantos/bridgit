import { useCallback, useEffect, useRef, useState } from 'react'

export const STAGGER_START_MS = 48
export const STAGGER_STEP_MS = 36
export const ITEM_MOTION_MS = 220

export function staggerCloseMs(itemCount) {
  const n = Math.max(itemCount, 1)
  return STAGGER_START_MS + STAGGER_STEP_MS * (n - 1) + ITEM_MOTION_MS
}

export function extrasPanelClassName(styles, open, closing) {
  if (open) return `${styles.extras} ${styles.extrasOpen}`
  if (closing) return `${styles.extras} ${styles.extrasClosing}`
  return styles.extras
}

export function useSuspendedMenu(itemCount, { enabled = true } = {}) {
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
    closeTimeoutRef.current = window.setTimeout(finishClose, staggerCloseMs(itemCount))
  }, [clearCloseTimeout, finishClose, itemCount])

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
  }, [open, closeMenu])

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
