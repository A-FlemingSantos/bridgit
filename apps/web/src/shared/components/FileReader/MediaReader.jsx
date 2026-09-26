import { useEffect, useRef } from 'react'
import styles from './FileReader.module.css'

export default function MediaReader({ mode, url, title, onReady, onError }) {
  const readyRef = useRef(false)

  useEffect(() => {
    readyRef.current = false
  }, [url])

  function markReady() {
    if (readyRef.current) return
    readyRef.current = true
    onReady?.()
  }

  function markFailed() {
    onError?.('Não foi possível carregar este arquivo.')
  }

  if (mode === 'audio') {
    return (
      <audio
        className={styles.mediaContent}
        src={url}
        controls
        preload="metadata"
        aria-label={title}
        onLoadedData={markReady}
        onError={markFailed}
      />
    )
  }

  return (
    <video
      className={styles.mediaContent}
      src={url}
      controls
      preload="metadata"
      aria-label={title}
      onLoadedData={markReady}
      onError={markFailed}
    />
  )
}
