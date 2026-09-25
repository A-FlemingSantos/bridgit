import { useEffect, useRef } from 'react'
import styles from './FileReader.module.css'

export default function MediaReader({ mode, url, title, onReady }) {
  const readyRef = useRef(false)

  useEffect(() => {
    readyRef.current = false
  }, [url])

  function markReady() {
    if (readyRef.current) return
    readyRef.current = true
    onReady?.()
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
    />
  )
}
