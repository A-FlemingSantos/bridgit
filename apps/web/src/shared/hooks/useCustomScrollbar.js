import { useCallback, useLayoutEffect, useRef, useState } from 'react'

const HIDDEN_THUMB_STATE = { visible: false, height: 0, top: 0 }
const HIDDEN_THUMB_X_STATE = { visible: false, width: 0, left: 0 }
const SCROLL_IDLE_MS = 120
const LAYOUT_DEBOUNCE_MS = 32

function computeThumbMetrics(viewport, { insetPx, minThumbPx }) {
  const { clientHeight, scrollHeight, scrollTop } = viewport

  if (!clientHeight || scrollHeight <= clientHeight + 1) {
    return HIDDEN_THUMB_STATE
  }

  const trackHeight = Math.max(0, clientHeight - insetPx * 2)
  const height = Math.max(
    minThumbPx,
    Math.round((clientHeight / scrollHeight) * trackHeight),
  )
  const maxTop = Math.max(0, trackHeight - height)
  const scrollRange = scrollHeight - clientHeight
  // Clamp for display only — never write scrollTop during layout passes.
  // TipTap/React can report a transiently-small scrollHeight mid-mutation;
  // assigning scrollTop = maxScrollTop then sticks the viewport far above the caret.
  const ratio = scrollRange > 0 ? Math.min(1, Math.max(0, scrollTop / scrollRange)) : 0
  const top = insetPx + ratio * maxTop

  return { visible: true, height, top }
}

function applyThumbStyles(thumb, metrics) {
  if (!thumb) return

  if (!metrics.visible) {
    thumb.style.height = '0px'
    thumb.style.transform = 'translate3d(0, 0, 0)'
    return
  }

  thumb.style.height = `${metrics.height}px`
  thumb.style.transform = `translate3d(0, ${metrics.top}px, 0)`
}

// The sideways thumb, for viewports that opt in (`horizontal`): the same metrics along the width.
function computeThumbXMetrics(viewport, { insetPx, minThumbPx }) {
  const { clientWidth, scrollWidth, scrollLeft } = viewport

  if (!clientWidth || scrollWidth <= clientWidth + 1) {
    return HIDDEN_THUMB_X_STATE
  }

  const trackWidth = Math.max(0, clientWidth - insetPx * 2)
  const width = Math.max(
    minThumbPx,
    Math.round((clientWidth / scrollWidth) * trackWidth),
  )
  const maxLeft = Math.max(0, trackWidth - width)
  const scrollRange = scrollWidth - clientWidth
  const ratio = scrollRange > 0 ? Math.min(1, Math.max(0, scrollLeft / scrollRange)) : 0
  const left = insetPx + ratio * maxLeft

  return { visible: true, width, left }
}

function applyThumbXStyles(thumb, metrics) {
  if (!thumb) return

  if (!metrics.visible) {
    thumb.style.width = '0px'
    thumb.style.transform = 'translate3d(0, 0, 0)'
    return
  }

  thumb.style.width = `${metrics.width}px`
  thumb.style.transform = `translate3d(${metrics.left}px, 0, 0)`
}

export default function useCustomScrollbar({
  enabled = true,
  refreshKey = 'default',
  insetPx = 0,
  minThumbPx = 18,
  horizontal = false,
  // An element that scrolls on its own (an editor's scroller) to follow instead of the viewport.
  scrollElement = null,
} = {}) {
  const viewportRef = useRef(null)
  const scrollElementRef = useRef(scrollElement)
  scrollElementRef.current = scrollElement
  const thumbRef = useRef(null)
  const thumbXRef = useRef(null)
  const thumbMetricsRef = useRef(HIDDEN_THUMB_STATE)
  const thumbXMetricsRef = useRef(HIDDEN_THUMB_X_STATE)
  const scrollIdleTimeoutRef = useRef(null)
  const layoutTimeoutRef = useRef(null)
  const [thumbVisible, setThumbVisible] = useState(false)
  const [thumbXVisible, setThumbXVisible] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isDraggingX, setIsDraggingX] = useState(false)
  const dragStateRef = useRef(null)

  const stopDragging = useCallback(() => {
    dragStateRef.current = null
    setIsDragging(false)
    setIsDraggingX(false)
  }, [])

  const handleThumbPointerDown = useCallback((event) => {
    const metrics = thumbMetricsRef.current
    if (!enabled || !metrics.visible) return

    const viewport = scrollElementRef.current ?? viewportRef.current
    if (!viewport) return

    const trackHeight = Math.max(0, viewport.clientHeight - insetPx * 2)
    const maxThumbTravel = Math.max(0, trackHeight - metrics.height)
    const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight)

    if (!maxThumbTravel || !maxScrollTop) return

    event.preventDefault()
    event.stopPropagation()

    dragStateRef.current = {
      startY: event.clientY,
      startScrollTop: viewport.scrollTop,
      maxScrollTop,
      maxThumbTravel,
    }
    setIsDragging(true)
  }, [enabled, insetPx])

  const handleThumbXPointerDown = useCallback((event) => {
    const metrics = thumbXMetricsRef.current
    if (!enabled || !horizontal || !metrics.visible) return

    const viewport = scrollElementRef.current ?? viewportRef.current
    if (!viewport) return

    const trackWidth = Math.max(0, viewport.clientWidth - insetPx * 2)
    const maxThumbTravel = Math.max(0, trackWidth - metrics.width)
    const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth)

    if (!maxThumbTravel || !maxScrollLeft) return

    event.preventDefault()
    event.stopPropagation()

    dragStateRef.current = {
      axis: 'x',
      startX: event.clientX,
      startScrollLeft: viewport.scrollLeft,
      maxScrollLeft,
      maxThumbTravel,
    }
    setIsDraggingX(true)
  }, [enabled, horizontal, insetPx])

  useLayoutEffect(() => {
    if (!enabled) {
      thumbMetricsRef.current = HIDDEN_THUMB_STATE
      thumbXMetricsRef.current = HIDDEN_THUMB_X_STATE
      setThumbVisible(false)
      setThumbXVisible(false)
      applyThumbStyles(thumbRef.current, HIDDEN_THUMB_STATE)
      applyThumbXStyles(thumbXRef.current, HIDDEN_THUMB_X_STATE)
      stopDragging()
      return undefined
    }

    const viewport = scrollElement ?? viewportRef.current
    if (!viewport) return undefined

    let frameId = null
    let dragFrameId = null

    function setVisible(nextVisible) {
      setThumbVisible((current) => (current === nextVisible ? current : nextVisible))
    }

    function commitMetrics(nextMetrics) {
      const previous = thumbMetricsRef.current
      thumbMetricsRef.current = nextMetrics
      applyThumbStyles(thumbRef.current, nextMetrics)

      if (previous.visible !== nextMetrics.visible) {
        setVisible(nextMetrics.visible)
      }
    }

    function commitXMetrics(nextMetrics) {
      const previous = thumbXMetricsRef.current
      thumbXMetricsRef.current = nextMetrics
      applyThumbXStyles(thumbXRef.current, nextMetrics)

      if (previous.visible !== nextMetrics.visible) {
        setThumbXVisible((current) => (current === nextMetrics.visible ? current : nextMetrics.visible))
      }
    }

    function updateThumbXPositionFromScroll() {
      const thumb = thumbXRef.current
      if (!horizontal || !thumb) return

      const nextMetrics = computeThumbXMetrics(viewport, { insetPx, minThumbPx })
      const metrics = thumbXMetricsRef.current

      if (
        metrics.visible !== nextMetrics.visible
        || metrics.width !== nextMetrics.width
      ) {
        commitXMetrics(nextMetrics)
        return
      }

      thumbXMetricsRef.current = { ...metrics, left: nextMetrics.left }
      thumb.style.transform = `translate3d(${nextMetrics.left}px, 0, 0)`
    }

    function updateThumbPositionFromScroll() {
      updateThumbXPositionFromScroll()

      const thumb = thumbRef.current
      if (!thumb) return

      const nextMetrics = computeThumbMetrics(viewport, { insetPx, minThumbPx })
      const metrics = thumbMetricsRef.current

      if (
        metrics.visible !== nextMetrics.visible
        || metrics.height !== nextMetrics.height
      ) {
        commitMetrics(nextMetrics)
        return
      }

      thumbMetricsRef.current = { ...metrics, top: nextMetrics.top }
      thumb.style.transform = `translate3d(0, ${nextMetrics.top}px, 0)`
    }

    function updateThumbLayout() {
      // Update thumb chrome only. Do not assign viewport.scrollTop here:
      // MutationObserver/ResizeObserver fire while TipTap is mid-DOM-update and
      // scrollHeight can briefly collapse. Clamping scrollTop against that
      // transient max jumps Docs (and other long editors) far above the caret.
      commitMetrics(computeThumbMetrics(viewport, { insetPx, minThumbPx }))
      if (horizontal) commitXMetrics(computeThumbXMetrics(viewport, { insetPx, minThumbPx }))
    }

    function scheduleFrameUpdate(updateFn) {
      if (frameId !== null) return

      frameId = requestAnimationFrame(() => {
        frameId = null
        updateFn()
      })
    }

    function scheduleLayoutUpdate() {
      if (layoutTimeoutRef.current !== null) {
        window.clearTimeout(layoutTimeoutRef.current)
      }

      layoutTimeoutRef.current = window.setTimeout(() => {
        layoutTimeoutRef.current = null
        scheduleFrameUpdate(updateThumbLayout)
      }, LAYOUT_DEBOUNCE_MS)
    }

    function markScrolling() {
      if (layoutTimeoutRef.current !== null) {
        window.clearTimeout(layoutTimeoutRef.current)
        layoutTimeoutRef.current = null
      }

      scheduleFrameUpdate(updateThumbPositionFromScroll)

      if (scrollIdleTimeoutRef.current !== null) {
        window.clearTimeout(scrollIdleTimeoutRef.current)
      }

      scrollIdleTimeoutRef.current = window.setTimeout(() => {
        scrollIdleTimeoutRef.current = null
        updateThumbLayout()
      }, SCROLL_IDLE_MS)
    }

    function handleScroll() {
      markScrolling()
    }

    function handlePointerMove(event) {
      const dragState = dragStateRef.current
      if (!dragState) return

      event.preventDefault()

      if (dragFrameId !== null) {
        cancelAnimationFrame(dragFrameId)
      }

      dragFrameId = requestAnimationFrame(() => {
        dragFrameId = null
        if (dragState.axis === 'x') {
          const deltaX = event.clientX - dragState.startX
          const nextScrollLeft = dragState.startScrollLeft + (deltaX / dragState.maxThumbTravel) * dragState.maxScrollLeft
          viewport.scrollLeft = Math.min(dragState.maxScrollLeft, Math.max(0, nextScrollLeft))
          return
        }
        const deltaY = event.clientY - dragState.startY
        const nextScrollTop = dragState.startScrollTop + (deltaY / dragState.maxThumbTravel) * dragState.maxScrollTop
        viewport.scrollTop = Math.min(dragState.maxScrollTop, Math.max(0, nextScrollTop))
      })
    }

    function handlePointerUp() {
      stopDragging()
    }

    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => scheduleLayoutUpdate())
      : null

    const mutationObserver = typeof MutationObserver === 'function'
      ? new MutationObserver(() => scheduleLayoutUpdate())
      : null

    updateThumbLayout()
    viewport.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', scheduleLayoutUpdate)
    window.addEventListener('pointermove', handlePointerMove, { passive: false })
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)

    resizeObserver?.observe(viewport)
    mutationObserver?.observe(viewport, {
      childList: true,
      subtree: true,
    })

    return () => {
      viewport.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', scheduleLayoutUpdate)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()

      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }
      if (dragFrameId !== null) {
        cancelAnimationFrame(dragFrameId)
      }
      if (scrollIdleTimeoutRef.current !== null) {
        window.clearTimeout(scrollIdleTimeoutRef.current)
        scrollIdleTimeoutRef.current = null
      }
      if (layoutTimeoutRef.current !== null) {
        window.clearTimeout(layoutTimeoutRef.current)
        layoutTimeoutRef.current = null
      }

      stopDragging()
    }
  }, [enabled, horizontal, insetPx, minThumbPx, refreshKey, scrollElement, stopDragging])

  return {
    viewportRef,
    thumbRef,
    thumbXRef,
    thumbVisible,
    thumbXVisible,
    isDragging,
    isDraggingX,
    handleThumbPointerDown,
    handleThumbXPointerDown,
  }
}
