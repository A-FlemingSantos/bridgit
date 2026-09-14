import { createContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import AppHeader from '../../../shared/components/AppHeader/AppHeader.jsx'
import CustomScrollArea from '../../../shared/components/CustomScrollArea/CustomScrollArea.jsx'
import styles from './AppShell.module.css'

const TOP_REVEAL_PX = 12
const DIRECTION_DELTA_PX = 4
const HOVER_ZONE_EXTRA_PX = 12

export const AppShellSubheaderShownContext = createContext(true)

export default function AppShell({ children, refreshKey, subheader = null }) {
  const viewportRef = useRef(null)
  const bodyRef = useRef(null)
  const subheaderRef = useRef(null)
  const lastScrollTopRef = useRef(0)
  const retractedRef = useRef(false)
  const hoverRevealRef = useRef(false)
  const spacerHeightRef = useRef(0)
  const [retracted, setRetracted] = useState(false)
  const [hoverReveal, setHoverReveal] = useState(false)
  const [spacerHeight, setSpacerHeight] = useState(0)
  const hasSubheader = Boolean(subheader)
  const shown = !retracted || hoverReveal

  useLayoutEffect(() => {
    const band = subheaderRef.current
    if (!band || !hasSubheader) {
      spacerHeightRef.current = 0
      setSpacerHeight(0)
      return undefined
    }

    function measure() {
      const height = band.offsetHeight
      spacerHeightRef.current = height
      setSpacerHeight(height)
    }

    measure()
    const observer = typeof ResizeObserver === 'function'
      ? new ResizeObserver(measure)
      : null
    observer?.observe(band)
    return () => observer?.disconnect()
  }, [hasSubheader, refreshKey])

  useEffect(() => {
    retractedRef.current = false
    hoverRevealRef.current = false
    lastScrollTopRef.current = 0
    setRetracted(false)
    setHoverReveal(false)

    const viewport = viewportRef.current
    const body = bodyRef.current
    if (!viewport || !body || !hasSubheader) return undefined

    function setRetractedIfChanged(next) {
      if (retractedRef.current === next) return
      retractedRef.current = next
      setRetracted(next)
    }

    function setHoverRevealIfChanged(next) {
      if (hoverRevealRef.current === next) return
      hoverRevealRef.current = next
      setHoverReveal(next)
    }

    function handleScroll() {
      const top = viewport.scrollTop
      const delta = top - lastScrollTopRef.current
      lastScrollTopRef.current = top

      if (top <= TOP_REVEAL_PX) {
        setRetractedIfChanged(false)
        return
      }

      if (hoverRevealRef.current) return

      if (delta > DIRECTION_DELTA_PX) {
        setRetractedIfChanged(true)
        return
      }

      if (delta < -DIRECTION_DELTA_PX) {
        setRetractedIfChanged(false)
      }
    }

    function handlePointerMove(event) {
      const zone = Math.max(spacerHeightRef.current, 48) + HOVER_ZONE_EXTRA_PX
      const y = event.clientY - body.getBoundingClientRect().top
      const overSubheader = Boolean(subheaderRef.current?.contains(event.target))
      setHoverRevealIfChanged(overSubheader || (y >= 0 && y <= zone))
    }

    function handlePointerLeave() {
      setHoverRevealIfChanged(false)
    }

    viewport.addEventListener('scroll', handleScroll, { passive: true })
    body.addEventListener('pointermove', handlePointerMove)
    body.addEventListener('pointerleave', handlePointerLeave)
    return () => {
      viewport.removeEventListener('scroll', handleScroll)
      body.removeEventListener('pointermove', handlePointerMove)
      body.removeEventListener('pointerleave', handlePointerLeave)
    }
  }, [hasSubheader, refreshKey])

  return (
    <AppShellSubheaderShownContext.Provider value={shown}>
      <div className={styles.page}>
      <AppHeader />
      <div className={styles.body} ref={bodyRef}>
        {subheader ? (
          <div
            ref={subheaderRef}
            className={[styles.subheader, shown ? '' : styles.subheaderRetracted].filter(Boolean).join(' ')}
          >
            {subheader}
          </div>
        ) : null}
        <CustomScrollArea
          className={styles.scroll}
          viewportClassName={styles.viewport}
          refreshKey={refreshKey}
          viewportRef={viewportRef}
        >
          {hasSubheader ? (
            <div className={styles.subheaderSpacer} style={{ height: spacerHeight }} aria-hidden="true" />
          ) : null}
          {children}
        </CustomScrollArea>
      </div>
    </div>
    </AppShellSubheaderShownContext.Provider>
  )
}
