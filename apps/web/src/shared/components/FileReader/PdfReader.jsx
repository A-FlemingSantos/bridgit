import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getContent, putContent, withContentLock } from '../../hub/storage/index.js'
import { isCacheableContent, verifyContentRevision } from '../../hub/content/index.js'
import { useDebouncedCallback } from './useDebouncedCallback.js'
import styles from './FileReader.module.css'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const ROOT_MARGIN = '240px 0px'

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

export default function PdfReader({ url, content, source, onFirstPageReady, onError }) {
  const containerRef = useRef(null)
  const [pageCount, setPageCount] = useState(0)
  const [renderWidth, setRenderWidth] = useState(0)
  const pdfRef = useRef(null)
  const pageRefs = useRef(new Map())
  const renderedPages = useRef(new Set())
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

  const renderPage = useCallback(
    async (pageNumber) => {
      const pdfDoc = pdfRef.current
      const canvas = pageRefs.current.get(pageNumber)
      const width = renderWidthRef.current

      if (!pdfDoc || !canvas || !width) return

      renderedPages.current.add(pageNumber)

      try {
        const page = await pdfDoc.getPage(pageNumber)
        const viewport = page.getViewport({ scale: 1 })
        const scale = width / viewport.width
        const scaledViewport = page.getViewport({ scale })

        const context = canvas.getContext('2d')
        canvas.width = Math.floor(scaledViewport.width)
        canvas.height = Math.floor(scaledViewport.height)
        canvas.style.width = '100%'
        canvas.style.height = 'auto'

        await page.render({
          canvasContext: context,
          viewport: scaledViewport,
        }).promise

        if (!firstPageReadyRef.current && pageNumber === 1) {
          firstPageReadyRef.current = true
          onFirstPageReady?.()
        }
      } catch (err) {
        renderedPages.current.delete(pageNumber)
        if (err?.name === 'AbortError') return
        if (pageNumber === 1 && !firstPageReadyRef.current) {
          onError?.('Não foi possível ler este PDF.')
        }
      }
    },
    [onFirstPageReady, onError],
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
      transport?.abort()
      void loadingTask?.destroy()
    }
  }, [loadKey, content])

  useEffect(() => {
    if (!pageCount || !renderWidth) return undefined

    const observers = []

    pageRefs.current.forEach((node, pageNumber) => {
      if (!node) return

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return
            if (renderedPages.current.has(pageNumber)) return
            renderPage(pageNumber)
          })
        },
        { rootMargin: ROOT_MARGIN },
      )

      observer.observe(node)
      observers.push(observer)
    })

    return () => {
      observers.forEach((observer) => observer.disconnect())
    }
  }, [pageCount, renderWidth, renderPage])

  useEffect(() => {
    renderedPages.current = new Set()
    firstPageReadyRef.current = false

    pageRefs.current.forEach((_, pageNumber) => {
      renderPage(pageNumber)
    })
  }, [renderWidth, renderPage])

  return (
    <div ref={containerRef} className={styles.pdfStack}>
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
          </div>
        )
      })}
    </div>
  )
}
