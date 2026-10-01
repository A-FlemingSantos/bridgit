import { useLayoutEffect, useRef } from 'react'
import styles from './FileReader.module.css'

export default function MediaReader({ mode, url, title, onReady, onError }) {
  const readyRef = useRef(false)
  const mediaRef = useRef(null)
  const timeRef = useRef(0)

  useLayoutEffect(() => {
    readyRef.current = false
  }, [url])

  function rememberTime() {
    if (readyRef.current && mediaRef.current) timeRef.current = mediaRef.current.currentTime
  }

  function markReady() {
    if (readyRef.current) return
    readyRef.current = true
    if (timeRef.current > 0 && mediaRef.current) {
      mediaRef.current.currentTime = timeRef.current
    }
    onReady?.()
  }

  function markFailed() {
    onError?.('Não foi possível carregar este arquivo.')
  }

  if (mode === 'audio') {
    return (
      <audio
        ref={mediaRef}
        className={styles.mediaContent}
        src={url}
        controls
        preload="metadata"
        aria-label={title}
        onLoadedData={markReady}
        onTimeUpdate={rememberTime}
        onError={markFailed}
      />
    )
  }

  return (
    <video
      ref={mediaRef}
      className={styles.mediaContent}
      src={url}
      controls
      preload="metadata"
      aria-label={title}
      onLoadedData={markReady}
      onTimeUpdate={rememberTime}
      onError={markFailed}
    />
  )
}
