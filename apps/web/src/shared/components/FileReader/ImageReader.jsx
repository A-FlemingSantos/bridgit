import { useState } from 'react'
import styles from './FileReader.module.css'

export default function ImageReader({ url, alt, onReady, onError }) {
  const [loaded, setLoaded] = useState(false)

  function handleLoad() {
    setLoaded(true)
    onReady?.()
  }

  return (
    <img
      className={styles.imageContent}
      src={url}
      alt={alt}
      onLoad={handleLoad}
      onError={() => onError?.('Não foi possível carregar a imagem.')}
      data-loaded={loaded ? 'true' : 'false'}
    />
  )
}
