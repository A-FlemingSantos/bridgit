import FileSheet from '../../../features/spaces/components/FileSheet/FileSheet.jsx'
import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getCachedContent, isCacheableContent, loadContent } from '../../hub/content/index.js'
import Spinner from '../Spinner/Spinner.jsx'
import DownloadAction from './DownloadAction.jsx'
import { formatFileMeta } from './formatFileMeta.js'
import ImageReader from './ImageReader.jsx'
import MediaReader from './MediaReader.jsx'
import PdfReader from './PdfReader.jsx'
import TextReader from './TextReader.jsx'
import styles from './FileReader.module.css'

const TRANSITION = { duration: 0.45, ease: [0.22, 1, 0.36, 1] }

function isReadableMode(mode) {
  return mode === 'pdf' || mode === 'image' || mode === 'text' || mode === 'video' || mode === 'audio'
}

export default function FileReader({
  file,
  source = null,
  error = null,
  downloadUrl = null,
  onDownload,
  onRetry,
  onContentError,
}) {
  const [contentReady, setContentReady] = useState(false)
  const [localError, setLocalError] = useState(null)
  const [retryKey, setRetryKey] = useState(0)
  const [abortSignal, setAbortSignal] = useState(() => new AbortController().signal)
  const [loadedContent, setLoadedContent] = useState(null)

  const mode = source?.mode ?? null
  const waitingForSource = source === null && !error
  const displayError = error ?? localError
  const unreadable = Boolean(displayError) || mode === 'none'
  const readable = Boolean(source && isReadableMode(mode) && !displayError)
  const isPdf = mode === 'pdf'
  const readerIdentity = source?.revision
    ? [source.userId, source.connectionId, source.generation, source.ref ?? file?.ref, source.variant, source.revision].join('|')
    : source?.url ?? null
  const contentSession = `${readerIdentity ?? 'sem-fonte'}|${mode}|${retryKey}`
  const content = loadedContent?.session === contentSession ? loadedContent.blob : null
  const contentRef = useRef(content)
  contentRef.current = content
  const sourceRef = useRef(source)
  sourceRef.current = source
  const contentPlanRef = useRef(null)
  if (contentPlanRef.current?.session !== contentSession) {
    // Authorization limits new cache reads. It must not evict bytes already opened in this session.
    contentPlanRef.current = { session: contentSession, cacheable: isCacheableContent(source) }
  }
  const cacheable = contentPlanRef.current.cacheable
  const contentErrorRef = useRef(onContentError)
  contentErrorRef.current = onContentError
  const currentRequestRef = useRef(null)
  const requestIdentity = `${contentSession}|${source?.url ?? ''}`
  currentRequestRef.current = requestIdentity
  const showCover = !isPdf && (waitingForSource || unreadable || (readable && !contentReady))
  const showLoader = waitingForSource || (readable && !contentReady)

  useEffect(() => {
    setContentReady(false)
    setLocalError(null)
  }, [readerIdentity, source?.mode, error])

  useEffect(() => {
    const controller = new AbortController()
    setAbortSignal(controller.signal)

    return () => {
      controller.abort()
    }
  }, [readerIdentity, source?.mode])

  const metaLine = useMemo(() => formatFileMeta(file), [file])
  const noneMessage = mode === 'none' ? 'Este arquivo não tem leitura no Bridgit' : null
  const statusMessage = displayError ?? noneMessage
  const showDownload = unreadable && (downloadUrl || onDownload)

  const handleContentReady = useCallback(() => {
    setContentReady(true)
  }, [])

  const handleContentError = useCallback((message) => {
    const request = currentRequestRef.current
    const fail = () => {
      if (currentRequestRef.current !== request) return
      setLocalError(message)
      setContentReady(false)
    }
    const recovery = contentErrorRef.current?.(message)
    if (recovery === true) return
    if (recovery?.then) {
      void Promise.resolve(recovery).then((recovered) => { if (recovered !== true) fail() }, fail)
      return
    }
    fail()
  }, [])

  useEffect(() => {
    setLocalError(null)
  }, [source?.url])

  useEffect(() => {
    currentRequestRef.current = requestIdentity
    return () => { currentRequestRef.current = null }
  }, [requestIdentity])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const descriptor = sourceRef.current
    if (contentRef.current || !isCacheableContent(descriptor)) return () => controller.abort()

    const read = descriptor.mode === 'pdf'
      ? getCachedContent(descriptor)
      : loadContent(descriptor, { signal: controller.signal })

    void read
      .then((blob) => {
        if (active && blob) setLoadedContent({ session: contentSession, blob })
      })
      .catch((error) => {
        if (!active || error?.name === 'AbortError') return
        handleContentError('Não foi possível carregar o arquivo.')
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [contentSession, source?.url, handleContentError])

  const handleRetry = useCallback(() => {
    setLocalError(null)
    setContentReady(false)
    setRetryKey((key) => key + 1)
    onRetry?.()
  }, [onRetry])

  const readerKey = `${readerIdentity ?? 'sem-fonte'}-${retryKey}`

  function renderReadableContent() {
    if (!readable || !source?.url) return null

    if (mode === 'image') {
      return (
        <ImageReader
          key={readerKey}
          url={source.url}
          content={content}
          deferNetwork={cacheable}
          alt={file?.name ?? 'Imagem do arquivo'}
          onReady={handleContentReady}
          onError={handleContentError}
        />
      )
    }

    if (mode === 'text') {
      return (
        <TextReader
          key={readerKey}
          url={source.url}
          content={content}
          deferNetwork={cacheable}
          signal={abortSignal}
          onReady={handleContentReady}
          onError={handleContentError}
        />
      )
    }

    if (mode === 'video' || mode === 'audio') {
      return (
        <MediaReader
          key={readerKey}
          mode={mode}
          url={source.url}
          title={file?.name ?? 'Arquivo de midia'}
          onReady={handleContentReady}
          onError={handleContentError}
        />
      )
    }

    return null
  }

  return (
    <section className={styles.reader} aria-labelledby="file-reader-title">
      <div
        className={styles.readingRegion}
        aria-busy={showLoader ? 'true' : 'false'}
        aria-live="polite"
      >
        {isPdf && readable ? (
          <div className={styles.pdfStage}>
            {!contentReady ? (
              <>
                <FileSheet large />
                <Spinner />
              </>
            ) : null}
            <div className={contentReady ? styles.pdfVisible : styles.pdfHidden} aria-hidden={!contentReady}>
              <PdfReader
                key={readerKey}
                url={source.url}
                content={content}
                source={source}
                onFirstPageReady={handleContentReady}
                onError={handleContentError}
              />
            </div>
          </div>
        ) : (
          <>
            <motion.div
              className={`${styles.sheetShell} ${contentReady && readable ? styles.sheetShellReading : styles.sheetShellCover}`}
              layout
              transition={TRANSITION}
            >
              {readable ? (
                <div
                  className={contentReady ? styles.contentLayer : styles.contentHidden}
                  aria-hidden={!contentReady}
                >
                  {renderReadableContent()}
                </div>
              ) : null}

              <AnimatePresence mode="wait" initial={false}>
                {showCover ? (
                  <motion.div
                    key="cover"
                    className={styles.coverPlaceholder}
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={TRANSITION}
                  >
                    <FileSheet large />
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.div>

            {showLoader ? <Spinner /> : null}
          </>
        )}
      </div>

      <div className={styles.meta}>
        <h2 id="file-reader-title" className={styles.title}>
          {file?.name ?? 'Arquivo'}
        </h2>
        {metaLine ? <p className={styles.subtitle}>{metaLine}</p> : null}
      </div>

      {statusMessage ? (
        <p
          className={`${styles.message} ${displayError ? styles.messageError : ''}`}
          role={displayError ? 'alert' : 'status'}
        >
          {statusMessage}
        </p>
      ) : null}

      {displayError && onRetry ? (
        <button type="button" className={styles.download} onClick={handleRetry}>
          Tentar novamente
        </button>
      ) : null}

      {showDownload ? <DownloadAction onDownload={onDownload} downloadUrl={downloadUrl} /> : null}
    </section>
  )
}
