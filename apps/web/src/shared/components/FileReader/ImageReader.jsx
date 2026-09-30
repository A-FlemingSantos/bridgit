import { useEffect, useState } from 'react'
import styles from './FileReader.module.css'

export default function ImageReader({ url, content, deferNetwork = false, alt, onReady, onError }) {
  const [loaded, setLoaded] = useState(false)
  const [contentUrl, setContentUrl] = useState(null)

  useEffect(() => {
    if (!content) {
      setContentUrl(null)
      return undefined
    }
    const objectUrl = URL.createObjectURL(content)
    setContentUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [content])

  function handleLoad() {
    setLoaded(true)
    onReady?.()
  }

  return (
    <img
      className={styles.imageContent}
      src={contentUrl ?? (deferNetwork ? undefined : url)}
      alt={alt}
      onLoad={handleLoad}
      onError={() => onError?.('Não foi possível carregar a imagem.')}
      data-loaded={loaded ? 'true' : 'false'}
    />
  )
}
