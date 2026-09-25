import { useEffect, useState } from 'react'
import styles from './FileReader.module.css'

const MAX_TEXT_BYTES = 2 * 1024 * 1024

export default function TextReader({ url, onReady, onError, signal }) {
  const [text, setText] = useState('')
  const [truncated, setTruncated] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadText() {
      try {
        const response = await fetch(url, { signal })

        if (!response.ok) {
          throw new Error('Nao foi possivel carregar o arquivo.')
        }

        const buffer = await response.arrayBuffer()
        const slice = buffer.byteLength > MAX_TEXT_BYTES ? buffer.slice(0, MAX_TEXT_BYTES) : buffer
        const decoded = new TextDecoder('utf-8', { fatal: false }).decode(slice)

        if (cancelled) return

        setText(decoded)
        setTruncated(buffer.byteLength > MAX_TEXT_BYTES)
        onReady?.()
      } catch (err) {
        if (cancelled || err.name === 'AbortError') return
        onError?.('Nao foi possivel ler este arquivo como texto.')
      }
    }

    loadText()

    return () => {
      cancelled = true
    }
  }, [url, signal, onReady, onError])

  return (
    <>
      {truncated ? (
        <p className={styles.notice} role="status">
          Exibindo os primeiros 2 MB do arquivo.
        </p>
      ) : null}
      <pre className={styles.textContent}>{text}</pre>
    </>
  )
}
