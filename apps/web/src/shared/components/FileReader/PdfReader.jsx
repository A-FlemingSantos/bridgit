import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useDebouncedCallback } from './useDebouncedCallback.js'
import styles from './FileReader.module.css'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const ROOT_MARGIN = '240px 0px'

export default function PdfReader({ url, onFirstPageReady }) {
  const containerRef = useRef(null)
  const [pageCount, setPageCount] = useState(0)
  const [renderWidth, setRenderWidth] = useState(0)
  const pdfRef = useRef(null)
  const pageRefs = useRef(new Map())
  const renderedPages = useRef(new Set())
  const firstPageReadyRef = useRef(false)
  const renderWidthRef = useRef(renderWidth)

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
      } catch {
        renderedPages.current.delete(pageNumber)
      }
    },
    [onFirstPageReady],
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
    // pdfjs-dist 6 releases the document through the loading task, not the document proxy.
    const loadingTask = pdfjs.getDocument({ url })

    async function loadDocument() {
      try {
        const pdf = await loadingTask.promise
        if (cancelled) return

        pdfRef.current = pdf
        setPageCount(pdf.numPages)
      } catch (err) {
        if (cancelled || err.name === 'AbortError') return
        setPageCount(0)
      }
    }

    loadDocument()

    return () => {
      cancelled = true
      pdfRef.current = null
      void loadingTask.destroy()
    }
  }, [url])

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
