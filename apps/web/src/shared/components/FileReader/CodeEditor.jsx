import { useEffect, useRef, useState } from 'react'
import CustomScrollArea from '../CustomScrollArea/CustomScrollArea.jsx'
import styles from './CodeEditor.module.css'

const MAX_TEXT_BYTES = 2 * 1024 * 1024

// Code editor (CodeMirror): line numbers, Monochrome highlighting, closing pairs and matching brackets.
// Nothing is saved yet: changes last while the file stays open. `editable: false` (public links, files cut at
// 2 MB) only reads. `fill`: the page takes the height its host gives it, down to the bottom edge.
export default function CodeEditor({
  url,
  content,
  extension,
  editable = false,
  deferNetwork = false,
  fill = false,
  onReady,
  onError,
  signal,
}) {
  const hostRef = useRef(null)
  const [loaded, setLoaded] = useState(null)

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
        const text = new TextDecoder('utf-8', { fatal: false }).decode(slice)

        if (cancelled) return

        setLoaded({ text, truncated: buffer.byteLength > MAX_TEXT_BYTES })
      } catch (err) {
        if (cancelled || err.name === 'AbortError') return
        onError?.('Não foi possível ler este arquivo como texto.')
      }
    }

    loadText()

    return () => {
      cancelled = true
    }
  }, [url, content, deferNetwork, signal, onError])

  const canEdit = editable && !loaded?.truncated

  useEffect(() => {
    if (!loaded || !hostRef.current) return undefined
    let cancelled = false
    let view = null

    // The editor loads on its own, when a file of code opens, so the rest of the app stays light.
    import('./codeEditorSetup.js')
      .then(({ createCodeEditor }) => {
        if (cancelled) return
        view = createCodeEditor({ parent: hostRef.current, text: loaded.text, extension, editable: canEdit })
        onReady?.()
      })
      .catch(() => {
        if (!cancelled) onError?.('Não foi possível abrir o editor.')
      })

    return () => {
      cancelled = true
      view?.destroy()
    }
  }, [loaded, extension, canEdit, onReady, onError])

  return (
    <div className={[styles.reader, fill ? styles.fill : ''].filter(Boolean).join(' ')}>
      {loaded?.truncated ? (
        <p className={styles.notice} role="status">
          Exibindo os primeiros 2 MB do arquivo, só para leitura.
        </p>
      ) : null}
      <CustomScrollArea className={styles.panel} horizontal>
        <div ref={hostRef} className={styles.host} data-code-editor="" />
      </CustomScrollArea>
    </div>
  )
}
