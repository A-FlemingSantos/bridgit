import { useEffect, useMemo, useState } from 'react'
import CustomScrollArea from '../CustomScrollArea/CustomScrollArea.jsx'
import styles from './CodeReader.module.css'

const MAX_TEXT_BYTES = 2 * 1024 * 1024

// One line per entry. A final line break ends the last line instead of opening an empty one.
export function splitLines(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

// Plain source view: line numbers beside the text, no highlighting. The numbers are a single text node
// (cheap for long files) that copying leaves out. `fill`: the page takes the height its host gives it,
// down to the bottom edge, instead of a fixed height.
export default function CodeReader({ url, content, deferNetwork = false, fill = false, onReady, onError, signal }) {
  const [text, setText] = useState('')
  const [truncated, setTruncated] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadText() {
      try {
        if (deferNetwork && !content) return
        const buffer = content
          ? await content.arrayBuffer()
          : await fetch(url, { signal }).then(async (response) => {
              if (!response.ok) throw new Error('Não foi possível carregar o arquivo.')
              return response.arrayBuffer()
            })
        const slice = buffer.byteLength > MAX_TEXT_BYTES ? buffer.slice(0, MAX_TEXT_BYTES) : buffer
        const decoded = new TextDecoder('utf-8', { fatal: false }).decode(slice)

        if (cancelled) return

        setText(decoded)
        setTruncated(buffer.byteLength > MAX_TEXT_BYTES)
        onReady?.()
      } catch (err) {
        if (cancelled || err.name === 'AbortError') return
        onError?.('Não foi possível ler este arquivo como texto.')
      }
    }

    loadText()

    return () => {
      cancelled = true
    }
  }, [url, content, deferNetwork, signal, onReady, onError])

  const { body, numbers } = useMemo(() => {
    const lines = splitLines(text)
    return {
      body: lines.join('\n'),
      numbers: lines.map((_, index) => index + 1).join('\n'),
    }
  }, [text])

  return (
    <div className={[styles.reader, fill ? styles.fill : ''].filter(Boolean).join(' ')}>
      {truncated ? (
        <p className={styles.notice} role="status">
          Exibindo os primeiros 2 MB do arquivo.
        </p>
      ) : null}
      {/* The text changes inside one node, which the scroll area's observers don't see: its length re-measures it. */}
      <CustomScrollArea className={styles.panel} horizontal refreshKey={body.length}>
        <div className={styles.lines}>
          <pre className={styles.gutter} aria-hidden="true" data-code-gutter="">
            {numbers}
          </pre>
          <pre className={styles.code} data-code-body="">
            {body}
          </pre>
        </div>
      </CustomScrollArea>
    </div>
  )
}
