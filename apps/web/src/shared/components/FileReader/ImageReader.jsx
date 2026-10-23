import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import styles from './FileReader.module.css'

// `viewer`: the image fits the space it is given, never past its own size. A click toggles its native size and
// the wheel zooms around the pointer; once zoomed, it is dragged with the mouse to the part wanted.
// A drag is not a click.
const DRAG_THRESHOLD_PX = 4
const MAX_SCALE = 8
const WHEEL_SENSITIVITY = 0.002
const LINE_HEIGHT_PX = 16

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export default function ImageReader({ url, content, deferNetwork = false, alt, viewer = false, onReady, onError }) {
  const [loaded, setLoaded] = useState(false)
  // null: fitted to the box. A number: the zoom, 1 being the native size.
  const [scale, setScale] = useState(null)
  const [scalable, setScalable] = useState(false)
  const [dragging, setDragging] = useState(false)
  const viewportRef = useRef(null)
  const imageRef = useRef(null)
  const dragRef = useRef(null)
  const draggedRef = useRef(false)
  // Where the zoomed image must sit once it renders: the point (fx, fy) of the image, under the pointer
  // (measured after the render, since the box itself may move or grow) or at (ox, oy) in the box.
  const anchorRef = useRef(null)
  const [contentUrl, setContentUrl] = useState(null)
  const zoomed = scale !== null

  useEffect(() => {
    if (!content) {
      setContentUrl(null)
      return undefined
    }
    const objectUrl = URL.createObjectURL(content)
    setContentUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [content])

  function applyAnchor() {
    const box = viewportRef.current
    const anchor = anchorRef.current
    anchorRef.current = null
    if (!box || !anchor) return
    const boxRect = box.getBoundingClientRect()
    const ox = anchor.pointer ? anchor.pointer.x - boxRect.left : anchor.ox
    const oy = anchor.pointer ? anchor.pointer.y - boxRect.top : anchor.oy
    box.scrollLeft = anchor.fx * box.scrollWidth - ox
    box.scrollTop = anchor.fy * box.scrollHeight - oy
  }

  useLayoutEffect(() => {
    if (scale === null) {
      const box = viewportRef.current
      if (box) {
        box.scrollLeft = 0
        box.scrollTop = 0
      }
      return
    }
    applyAnchor()
  }, [scale])

  // React attaches wheel listeners as passive, which cannot stop the page behind from scrolling.
  useEffect(() => {
    const box = viewportRef.current
    if (!viewer || !box) return undefined

    function handleWheel(event) {
      const image = imageRef.current
      if (!image || !image.naturalWidth || !image.naturalHeight) return
      event.preventDefault()

      const rect = image.getBoundingClientRect()
      const maxHeight = Number.parseFloat(getComputedStyle(box).maxHeight)
      const fit = Math.min(
        box.clientWidth / image.naturalWidth,
        (Number.isFinite(maxHeight) ? maxHeight : box.clientHeight) / image.naturalHeight,
        1,
      )
      const current = rect.width / image.naturalWidth
      const delta = event.deltaY * (event.deltaMode === 1 ? LINE_HEIGHT_PX : 1)
      const next = clamp(current * Math.exp(-delta * WHEEL_SENSITIVITY), fit, MAX_SCALE)
      if (Math.abs(next - current) < 1e-4) return

      anchorRef.current = {
        fx: clamp((event.clientX - rect.left) / rect.width, 0, 1),
        fy: clamp((event.clientY - rect.top) / rect.height, 0, 1),
        pointer: { x: event.clientX, y: event.clientY },
      }
      // Rendered at once, so the next wheel event measures the image as it now is.
      flushSync(() => setScale(next <= fit * 1.001 ? null : next))
    }

    box.addEventListener('wheel', handleWheel, { passive: false })
    return () => box.removeEventListener('wheel', handleWheel)
  }, [viewer])

  function handlePointerDown(event) {
    const box = viewportRef.current
    if (!zoomed || !box || event.button !== 0) return
    dragRef.current = { x: event.clientX, y: event.clientY, left: box.scrollLeft, top: box.scrollTop, moved: false }
  }

  function handlePointerMove(event) {
    const drag = dragRef.current
    const box = viewportRef.current
    if (!drag || !box) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
      drag.moved = true
      draggedRef.current = true
      setDragging(true)
      // Captured only once it is a drag, so a plain click still reaches the button.
      box.setPointerCapture?.(event.pointerId)
    }
    box.scrollLeft = drag.left - dx
    box.scrollTop = drag.top - dy
  }

  function endDrag() {
    dragRef.current = null
    setDragging(false)
    // The click that follows a drag arrives right after; once it has passed, clicks count again.
    setTimeout(() => {
      draggedRef.current = false
    }, 0)
  }

  // Entering the native size, the part that was clicked comes to the middle of the box.
  function handleToggle(event) {
    const box = viewportRef.current
    if (!zoomed && box) {
      const rect = event.currentTarget.getBoundingClientRect()
      const centered = event.detail === 0 || !rect.width || !rect.height
      anchorRef.current = {
        fx: centered ? 0.5 : clamp((event.clientX - rect.left) / rect.width, 0, 1),
        fy: centered ? 0.5 : clamp((event.clientY - rect.top) / rect.height, 0, 1),
        ox: box.clientWidth / 2,
        oy: box.clientHeight / 2,
      }
    }
    setScale(zoomed ? null : 1)
  }

  function handleLoad(event) {
    const element = event.currentTarget
    setScalable(element.naturalWidth > element.clientWidth + 1 || element.naturalHeight > element.clientHeight + 1)
    setLoaded(true)
    onReady?.()
  }

  const image = (
    <img
      ref={imageRef}
      className={viewer ? styles.imageViewer : styles.imageContent}
      style={
        zoomed && imageRef.current
          ? { width: imageRef.current.naturalWidth * scale, height: imageRef.current.naturalHeight * scale }
          : undefined
      }
      src={contentUrl ?? (deferNetwork ? undefined : url)}
      alt={alt}
      draggable={false}
      onLoad={handleLoad}
      onError={() => onError?.('Não foi possível carregar a imagem.')}
      data-loaded={loaded ? 'true' : 'false'}
    />
  )

  if (!viewer) return image

  return (
    <div
      ref={viewportRef}
      className={styles.imageViewport}
      data-dismiss={zoomed ? undefined : ''}
      data-native={zoomed ? 'true' : 'false'}
      data-dragging={dragging ? 'true' : 'false'}
      onClickCapture={(event) => {
        // The click that ends a drag is neither a toggle nor a click outside the image.
        if (draggedRef.current) event.stopPropagation()
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <button
        type="button"
        className={styles.imageToggle}
        data-scalable={scalable || zoomed ? 'true' : 'false'}
        aria-pressed={zoomed}
        aria-label={zoomed ? 'Ajustar imagem à tela' : 'Ver imagem em tamanho original'}
        onClick={handleToggle}
      >
        {image}
      </button>
    </div>
  )
}
