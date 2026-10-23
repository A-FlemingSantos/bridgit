import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { getContent, putContent, withContentLock } from '../../hub/storage/index.js'
import { isCacheableContent, verifyContentRevision } from '../../hub/content/index.js'
import { useDebouncedCallback } from './useDebouncedCallback.js'
import styles from './FileReader.module.css'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const ROOT_MARGIN = '240px 0px'
// Pages further than this from the viewport give their pixels back; they render again when it comes close.
const RELEASE_MARGIN = '2400px 0px'
// Rendered denser than it is shown, so text stays sharp on a plain display and when the window is large.
const MIN_OUTPUT_SCALE = 2
const MAX_OUTPUT_SCALE = 3
const MAX_PAGE_PIXELS = 16 * 1024 * 1024
// Zoom, as a multiple of the width the viewer gives the pages; Ctrl (or Cmd) and the wheel move it.
const MIN_ZOOM = 0.5
const MAX_ZOOM = 4
const WHEEL_SENSITIVITY = 0.002
const LINE_HEIGHT_PX = 16

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function outputScaleFor(viewport) {
  const wanted = Math.min(Math.max(window.devicePixelRatio || 1, MIN_OUTPUT_SCALE), MAX_OUTPUT_SCALE)
  const fits = Math.sqrt(MAX_PAGE_PIXELS / Math.max(viewport.width * viewport.height, 1))
  return Math.max(Math.min(wanted, fits), 1)
}

export class ProgressivePdfTransport extends pdfjs.PDFDataRangeTransport {
  constructor(source, onFailure) {
    super(source.size, null, false)
    this.source = source
    this.controller = new AbortController()
    this.fullChunks = []
    this.fullLoaded = 0
    this.rangeRequests = new Map()
    this.proxyFallbackUsed = false
    this.activeUrl = source.url
    this.started = false
    this.onFailure = onFailure
  }

  start() {
    if (this.started) return
    this.started = true
    void withContentLock(
      this.source,
      async () => {
        const cached = await getContent(this.source)
        if (cached) {
          await this.pushCached(cached)
          return
        }
        const blob = await this.download()
        if (blob && blob.size === this.source.size && await verifyContentRevision(this.source)) {
          await putContent(this.source, blob)
        }
      },
      { signal: this.controller.signal },
    ).catch((error) => {
      if (!this.controller.signal.aborted) this.onFailure?.(error)
      this.abort()
    })
  }

  async pushCached(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    this.fullChunks.push(bytes.slice())
    this.fullLoaded = bytes.byteLength
    this.flushRanges()
    this.onDataProgressiveRead(bytes.slice())
    this.onDataProgressiveDone()
  }

  async download() {
    try {
      return await this.downloadFrom(this.source.url)
    } catch (error) {
      if (
        this.controller.signal.aborted ||
        this.fullLoaded > 0 ||
        this.proxyFallbackUsed ||
        this.source.providerId !== 'onedrive' ||
        !this.source.proxyUrl
      ) {
        throw error
      }
      this.proxyFallbackUsed = true
      this.activeUrl = this.source.proxyUrl
      return this.downloadFrom(this.source.proxyUrl)
    }
  }

  async downloadFrom(url) {
    const response = await fetch(url, { signal: this.controller.signal })
    if (!response.ok || !response.body) throw new Error('Não foi possível carregar o arquivo.')

    const reader = response.body.getReader()
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        if (!value) continue
        const cached = value.slice()
        this.fullChunks.push(cached)
        this.fullLoaded += cached.byteLength
        this.onDataProgressiveRead(value.slice())
        this.flushRanges()
      }
    } finally {
      reader.releaseLock()
    }

    this.flushRanges()
    this.onDataProgressiveDone()
    return this.fullLoaded === this.source.size
      ? new Blob(this.fullChunks, { type: 'application/pdf' })
      : null
  }

  requestDataRange(begin, end) {
    if (begin < 0 || end <= begin || end > this.source.size) return
    if (end <= this.fullLoaded) {
      this.onDataRange(begin, this.sliceFull(begin, end).slice())
      return
    }
    const key = `${begin}:${end}`
    if (this.rangeRequests.has(key)) return
    const entry = { begin, end, fulfilled: false }
    this.rangeRequests.set(key, entry)
    entry.promise = this.downloadRange(begin, end)
      .then((bytes) => {
        if (entry.fulfilled) return
        entry.fulfilled = true
        this.onDataRange(begin, bytes.slice())
      })
      .catch((error) => {
        if (!this.controller.signal.aborted) this.onFailure?.(error)
      })
      .finally(() => {
        if (this.rangeRequests.get(key) === entry) this.rangeRequests.delete(key)
      })
  }

  flushRanges() {
    this.rangeRequests.forEach((entry, key) => {
      if (entry.fulfilled || entry.end > this.fullLoaded) return
      entry.fulfilled = true
      this.onDataRange(entry.begin, this.sliceFull(entry.begin, entry.end).slice())
      this.rangeRequests.delete(key)
    })
  }

  sliceFull(begin, end) {
    const all = new Uint8Array(end - begin)
    let offset = 0
    let position = 0
    for (const chunk of this.fullChunks) {
      const chunkEnd = position + chunk.byteLength
      if (chunkEnd > begin && position < end) {
        const from = Math.max(begin - position, 0)
        const to = Math.min(end - position, chunk.byteLength)
        all.set(chunk.subarray(from, to), offset)
        offset += to - from
      }
      position = chunkEnd
      if (position >= end) break
    }
    return all
  }

  async downloadRange(begin, end) {
    try {
      return await this.downloadRangeFrom(this.activeUrl, begin, end)
    } catch (error) {
      if (
        this.controller.signal.aborted ||
        this.proxyFallbackUsed ||
        this.source.providerId !== 'onedrive' ||
        !this.source.proxyUrl
      ) {
        throw error
      }
      this.proxyFallbackUsed = true
      this.activeUrl = this.source.proxyUrl
      return this.downloadRangeFrom(this.source.proxyUrl, begin, end)
    }
  }

  async downloadRangeFrom(url, begin, end) {
    const response = await fetch(url, {
      signal: this.controller.signal,
      headers: { Range: `bytes=${begin}-${end - 1}` },
    })
    if (!response.ok) throw new Error('Não foi possível carregar o arquivo.')
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength !== end - begin) throw new Error('Intervalo de PDF inválido.')
    return bytes
  }

  abort() {
    this.controller.abort()
    this.rangeRequests.clear()
  }
}

export default function PdfReader({ url, content, source, viewer = false, onFirstPageReady, onError }) {
  const containerRef = useRef(null)
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(1)
  const endRefs = useRef(new Map())
  const [pageCount, setPageCount] = useState(0)
  const [renderWidth, setRenderWidth] = useState(0)
  const pdfRef = useRef(null)
  const pageRefs = useRef(new Map())
  const renderedPages = useRef(new Set())
  const renderTasks = useRef(new Map())
  const textRefs = useRef(new Map())
  const textLayers = useRef(new Map())
  const firstPageReadyRef = useRef(false)
  const renderWidthRef = useRef(renderWidth)
  const onErrorRef = useRef(onError)
  const sourceRef = useRef(source)
  sourceRef.current = source
  const loadKey = content ? source?.revision ?? url : url
  onErrorRef.current = onError

  useEffect(() => {
    renderWidthRef.current = renderWidth
  }, [renderWidth])

  const updateWidth = useDebouncedCallback(() => {
    const node = containerRef.current
    if (!node) return
    setRenderWidth(node.clientWidth)
  }, 150)

  // The text over the canvas: invisible, but it is what the mouse selects and the browser searches.
  const renderTextLayer = useCallback(async (pageNumber, page, viewport) => {
    const container = textRefs.current.get(pageNumber)
    if (!container || typeof page.streamTextContent !== 'function') return
    textLayers.current.get(pageNumber)?.cancel()
    container.replaceChildren()
    container.style.setProperty('--total-scale-factor', String(viewport.scale))
    container.style.setProperty('--scale-round-x', '1px')
    container.style.setProperty('--scale-round-y', '1px')
    const layer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container, viewport })
    textLayers.current.set(pageNumber, layer)
    try {
      await layer.render()
    } catch {
      // A page without readable text stays an image, as before.
      return
    }
    // Catches a selection dragged over blank space, so it ends at the pointer instead of jumping across the page.
    const end = document.createElement('div')
    end.className = styles.endOfContent
    container.append(end)
    endRefs.current.set(pageNumber, end)
  }, [])

  const releasePage = useCallback((pageNumber) => {
    if (!renderedPages.current.has(pageNumber)) return
    renderedPages.current.delete(pageNumber)
    renderTasks.current.get(pageNumber)?.cancel()
    renderTasks.current.delete(pageNumber)
    textLayers.current.get(pageNumber)?.cancel()
    textLayers.current.delete(pageNumber)
    textRefs.current.get(pageNumber)?.replaceChildren()
    const canvas = pageRefs.current.get(pageNumber)
    if (canvas) {
      canvas.width = 1
      canvas.height = 1
    }
  }, [])

  const renderPage = useCallback(
    async (pageNumber) => {
      const pdfDoc = pdfRef.current
      const canvas = pageRefs.current.get(pageNumber)
      const width = renderWidthRef.current

      if (!pdfDoc || !canvas || !width) return

      renderedPages.current.add(pageNumber)
      // A canvas takes one render at a time: a newer width replaces the render still in flight.
      renderTasks.current.get(pageNumber)?.cancel()
      renderTasks.current.delete(pageNumber)

      try {
        const page = await pdfDoc.getPage(pageNumber)
        if (pdfRef.current !== pdfDoc || renderWidthRef.current !== width) return
        const viewport = page.getViewport({ scale: 1 })
        const scale = width / viewport.width
        const cssViewport = page.getViewport({ scale })
        const renderViewport = page.getViewport({ scale: scale * outputScaleFor(cssViewport) })

        const context = canvas.getContext('2d')
        canvas.width = Math.floor(renderViewport.width)
        canvas.height = Math.floor(renderViewport.height)
        canvas.style.width = '100%'
        canvas.style.height = 'auto'
        // Keeps the page's height while its pixels are released.
        canvas.style.aspectRatio = `${cssViewport.width} / ${cssViewport.height}`

        const task = page.render({
          canvasContext: context,
          viewport: renderViewport,
        })
        renderTasks.current.set(pageNumber, task)
        try {
          await task.promise
        } finally {
          if (renderTasks.current.get(pageNumber) === task) renderTasks.current.delete(pageNumber)
        }

        void renderTextLayer(pageNumber, page, cssViewport)

        if (!firstPageReadyRef.current && pageNumber === 1) {
          firstPageReadyRef.current = true
          onFirstPageReady?.()
        }
      } catch (err) {
        if (err?.name === 'RenderingCancelledException') return
        renderedPages.current.delete(pageNumber)
        if (err?.name === 'AbortError') return
        if (pageNumber === 1 && !firstPageReadyRef.current) {
          onError?.('Não foi possível ler este PDF.')
        }
      }
    },
    [onFirstPageReady, onError, renderTextLayer],
  )

  useEffect(() => {
    const node = containerRef.current
    if (!node) return undefined

    updateWidth()

    const observer = new ResizeObserver(() => {
      updateWidth()
    })

    observer.observe(node)

    return () => {
      observer.disconnect()
    }
  }, [updateWidth])

  // Keeps a selection dragged over blank space from jumping across the page. While one is under way, each
  // layer's end-of-content element sits right after the selected text (and covers the page), so the pointer
  // always lands on something selectable; when it ends, the element goes back to the bottom of its layer.
  useEffect(() => {
    const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent
    const chromiumVersion = Number.parseInt(/\bChrome\/(\d+)\b/.exec(userAgent)?.[1] ?? '', 10)
    // Firefox and recent Chromium keep the selection continuous by themselves.
    const selfSufficient = /\bFirefox\//.test(userAgent) || chromiumVersion >= 148
    let prevRange = null
    let pointerDown = false

    function reset(container, end) {
      container.append(end)
      end.style.width = ''
      end.style.height = ''
      end.style.userSelect = ''
      container.classList.remove(styles.selecting)
    }

    function resetAll() {
      textRefs.current.forEach((container, pageNumber) => {
        const end = endRefs.current.get(pageNumber)
        if (end) reset(container, end)
      })
    }

    function handlePointerDown() {
      pointerDown = true
    }

    function handlePointerUp() {
      pointerDown = false
      resetAll()
    }

    function handleKeyUp() {
      if (!pointerDown) resetAll()
    }

    function handleSelectionChange() {
      const selection = document.getSelection()
      if (!selection || selection.rangeCount === 0) {
        resetAll()
        return
      }

      const active = new Set()
      for (let index = 0; index < selection.rangeCount; index += 1) {
        const range = selection.getRangeAt(index)
        textRefs.current.forEach((container) => {
          if (!active.has(container) && range.intersectsNode(container)) active.add(container)
        })
      }
      textRefs.current.forEach((container, pageNumber) => {
        const end = endRefs.current.get(pageNumber)
        if (!end) return
        if (active.has(container)) container.classList.add(styles.selecting)
        else reset(container, end)
      })
      if (selfSufficient) return

      const range = selection.getRangeAt(0)
      const modifyStart = prevRange
        && (range.compareBoundaryPoints(Range.END_TO_END, prevRange) === 0
          || range.compareBoundaryPoints(Range.START_TO_END, prevRange) === 0)
      let anchor = modifyStart ? range.startContainer : range.endContainer
      if (anchor.nodeType === Node.TEXT_NODE) anchor = anchor.parentNode
      if (!modifyStart && range.endOffset === 0) {
        do {
          while (!anchor.previousSibling) anchor = anchor.parentNode
          anchor = anchor.previousSibling
        } while (!anchor.childNodes.length)
      }
      const container = anchor.parentElement?.closest(`.${styles.textLayer}`)
      const entry = container
        ? [...textRefs.current].find(([, node]) => node === container)
        : null
      const end = entry ? endRefs.current.get(entry[0]) : null
      if (container && end) {
        end.style.width = container.style.width || '100%'
        end.style.height = container.style.height || '100%'
        end.style.userSelect = 'text'
        anchor.parentElement.insertBefore(end, modifyStart ? anchor : anchor.nextSibling)
      }
      prevRange = range.cloneRange()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('pointerup', handlePointerUp)
    document.addEventListener('keyup', handleKeyUp)
    document.addEventListener('selectionchange', handleSelectionChange)
    window.addEventListener('blur', resetAll)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('pointerup', handlePointerUp)
      document.removeEventListener('keyup', handleKeyUp)
      document.removeEventListener('selectionchange', handleSelectionChange)
      window.removeEventListener('blur', resetAll)
    }
  }, [])

  useEffect(() => {
    const stack = containerRef.current
    if (!viewer || !stack) return undefined
    const scroller = stack.closest('[data-custom-scroll-viewport]')
    const target = scroller ?? stack

    function handleWheel(event) {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()

      const delta = event.deltaY * (event.deltaMode === 1 ? LINE_HEIGHT_PX : 1)
      const current = zoomRef.current
      const next = clamp(current * Math.exp(-delta * WHEEL_SENSITIVITY), MIN_ZOOM, MAX_ZOOM)
      if (Math.abs(next - current) < 1e-4) return

      // The point of the pages under the pointer stays under it.
      const rect = stack.getBoundingClientRect()
      const fx = clamp((event.clientX - rect.left) / rect.width, 0, 1)
      const fy = clamp((event.clientY - rect.top) / rect.height, 0, 1)
      zoomRef.current = next
      flushSync(() => setZoom(next))
      const after = stack.getBoundingClientRect()
      if (scroller) {
        scroller.scrollLeft += after.left + fx * after.width - event.clientX
        scroller.scrollTop += after.top + fy * after.height - event.clientY
      }
    }

    target.addEventListener('wheel', handleWheel, { passive: false })
    return () => target.removeEventListener('wheel', handleWheel)
  }, [viewer])

  useEffect(() => {
    let cancelled = false
    renderedPages.current = new Set()
    firstPageReadyRef.current = false
    let transport = null
    let loadingTask = null

    async function loadDocument() {
      try {
        if (content) {
          const data = new Uint8Array(await content.arrayBuffer())
          if (cancelled) return
          loadingTask = pdfjs.getDocument({ data })
        } else if (isCacheableContent(sourceRef.current)) {
          transport = new ProgressivePdfTransport(sourceRef.current, () => onErrorRef.current?.('Não foi possível ler este PDF.'))
          loadingTask = pdfjs.getDocument({
            range: transport,
            disableRange: false,
            disableStream: false,
            rangeChunkSize: 64 * 1024,
          })
          transport.start()
        } else {
          loadingTask = pdfjs.getDocument({ url })
        }
        const pdf = await loadingTask.promise
        if (cancelled) return

        pdfRef.current = pdf
        setPageCount(pdf.numPages)
      } catch (err) {
        if (cancelled || err?.name === 'AbortError') return
        onErrorRef.current?.('Não foi possível ler este PDF.')
      }
    }

    loadDocument()

    return () => {
      cancelled = true
      pdfRef.current = null
      renderTasks.current.forEach((task) => task.cancel())
      renderTasks.current.clear()
      textLayers.current.forEach((layer) => layer.cancel())
      textLayers.current.clear()
      transport?.abort()
      void loadingTask?.destroy()
    }
  }, [loadKey, content])

  useEffect(() => {
    if (!pageCount || !renderWidth) return undefined

    // Every width is a fresh layout. The first page is rendered outright: the reader stays hidden
    // until it is ready, and a hidden page never reaches the viewport to be observed.
    renderedPages.current = new Set()
    renderPage(1)

    const observers = []
    // The margins only reach past the edge of the scroll area that holds the pages, when that area is the root.
    const root = containerRef.current?.closest('[data-custom-scroll-viewport]') ?? null

    pageRefs.current.forEach((node, pageNumber) => {
      if (!node) return

      const releaser = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting && pageNumber !== 1) releasePage(pageNumber)
          })
        },
        { root, rootMargin: RELEASE_MARGIN },
      )
      releaser.observe(node)
      observers.push(releaser)

      if (!node) return

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return
            if (renderedPages.current.has(pageNumber)) return
            renderPage(pageNumber)
          })
        },
        { root, rootMargin: ROOT_MARGIN },
      )

      observer.observe(node)
      observers.push(observer)
    })

    return () => {
      observers.forEach((observer) => observer.disconnect())
    }
  }, [pageCount, renderWidth, renderPage, releasePage])

  return (
    <div
      ref={containerRef}
      className={styles.pdfStack}
      style={viewer ? { '--zoom': zoom } : undefined}
    >
      {Array.from({ length: pageCount }, (_, index) => {
        const pageNumber = index + 1

        return (
          <div key={pageNumber} className={styles.pageSheet} aria-label={`Pagina ${pageNumber}`}>
            <canvas
              ref={(node) => {
                if (node) {
                  pageRefs.current.set(pageNumber, node)
                } else {
                  pageRefs.current.delete(pageNumber)
                }
              }}
            />
            <div
              className={styles.textLayer}
              onMouseDown={(event) => event.currentTarget.classList.add(styles.selecting)}
              ref={(node) => {
                if (node) {
                  textRefs.current.set(pageNumber, node)
                } else {
                  textRefs.current.delete(pageNumber)
                }
              }}
            />
          </div>
        )
      })}
    </div>
  )
}
