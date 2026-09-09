import { memo, useCallback } from 'react'
import useCustomScrollbar from '../../hooks/useCustomScrollbar.js'
import styles from './CustomScrollArea.module.css'

const DEFAULT_INSET_PX = 0
const DEFAULT_MIN_THUMB_PX = 18

function assignRef(ref, value) {
  if (typeof ref === 'function') {
    ref(value)
    return
  }

  if (ref) {
    ref.current = value
  }
}

function CustomScrollArea({
  children,
  enabled = true,
  refreshKey = 'default',
  insetPx = DEFAULT_INSET_PX,
  minThumbPx = DEFAULT_MIN_THUMB_PX,
  className = '',
  viewportClassName = '',
  viewportTag = 'div',
  viewportProps = null,
  viewportRef = null,
}) {
  const scrollbar = useCustomScrollbar({
    enabled,
    refreshKey,
    insetPx,
    minThumbPx,
  })

  const ViewportTag = viewportTag
  const viewportRest = viewportProps ?? {}
  const rootClassName = [styles.root, className].filter(Boolean).join(' ')
  const viewportCombinedClassName = [styles.viewport, viewportClassName].filter(Boolean).join(' ')
  const trackClassName = [
    styles.track,
    scrollbar.thumbVisible ? '' : styles.trackHidden,
  ].filter(Boolean).join(' ')

  const setViewportRef = useCallback((node) => {
    assignRef(scrollbar.viewportRef, node)
    assignRef(viewportRef, node)
  }, [scrollbar.viewportRef, viewportRef])

  return (
    <div className={rootClassName}>
      <ViewportTag
        {...viewportRest}
        ref={setViewportRef}
        className={viewportCombinedClassName}
        data-custom-scroll-viewport=""
      >
        {children}
      </ViewportTag>
      <span className={trackClassName} aria-hidden={!scrollbar.thumbVisible}>
        <span
          ref={scrollbar.thumbRef}
          className={`${styles.thumb} ${scrollbar.isDragging ? styles.thumbDragging : ''}`}
          onPointerDown={scrollbar.handleThumbPointerDown}
        />
      </span>
    </div>
  )
}

export default memo(CustomScrollArea)
