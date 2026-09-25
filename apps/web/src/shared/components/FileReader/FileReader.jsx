import FileSheet from '../../../features/spaces/components/FileSheet/FileSheet.jsx'
import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
}) {
  const [contentReady, setContentReady] = useState(false)
  const [localError, setLocalError] = useState(null)
  const [abortSignal, setAbortSignal] = useState(() => new AbortController().signal)

  const mode = source?.mode ?? null
  const waitingForSource = source === null && !error
  const displayError = error ?? localError
  const unreadable = Boolean(displayError) || mode === 'none'
  const readable = Boolean(source && isReadableMode(mode) && !displayError)
  const isPdf = mode === 'pdf'
  const showCover = !isPdf && (waitingForSource || unreadable || (readable && !contentReady))
  const showLoader = waitingForSource || (readable && !contentReady)

  useEffect(() => {
    setContentReady(false)
    setLocalError(null)
  }, [source?.url, source?.mode, error])

  useEffect(() => {
    const controller = new AbortController()
    setAbortSignal(controller.signal)

    return () => {
      controller.abort()
    }
  }, [source?.url, source?.mode])

  const metaLine = useMemo(() => formatFileMeta(file), [file])
  const noneMessage = mode === 'none' ? 'Este arquivo não tem leitura no Bridgit' : null
  const statusMessage = displayError ?? noneMessage
  const showDownload = unreadable && (downloadUrl || onDownload)

  const handleContentReady = useCallback(() => {
    setContentReady(true)
  }, [])

  const handleContentError = useCallback((message) => {
    setLocalError(message)
    setContentReady(false)
  }, [])

  function renderReadableContent() {
    if (!readable || !source?.url) return null

    if (mode === 'image') {
      return (
        <ImageReader
          url={source.url}
          alt={file?.name ?? 'Imagem do arquivo'}
          onReady={handleContentReady}
          onError={handleContentError}
        />
      )
    }

    if (mode === 'text') {
      return (
        <TextReader
          url={source.url}
          signal={abortSignal}
          onReady={handleContentReady}
          onError={handleContentError}
        />
      )
    }

    if (mode === 'video' || mode === 'audio') {
      return (
        <MediaReader
          mode={mode}
          url={source.url}
          title={file?.name ?? 'Arquivo de midia'}
          onReady={handleContentReady}
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
              <PdfReader url={source.url} onFirstPageReady={handleContentReady} />
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

      {showDownload ? <DownloadAction onDownload={onDownload} downloadUrl={downloadUrl} /> : null}
    </section>
  )
}
