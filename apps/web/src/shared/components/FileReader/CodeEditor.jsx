import { useEffect, useRef, useState } from 'react'
import CustomScrollArea from '../CustomScrollArea/CustomScrollArea.jsx'
import { decodeText } from './textDocument.js'
import useContentAutosave from './useContentAutosave.js'
import styles from './CodeEditor.module.css'

const UNSAVED_STATES = new Set(['pending', 'saving', 'unsaved', 'conflict'])

// Code editor (CodeMirror): line numbers, Monochrome highlighting, closing pairs, matching brackets and a minimap.
// With `onSave` it saves on its own (see useContentAutosave) and reports its state through `onSaveStatusChange`;
// `onSaveController` hands the host what it needs to flush before closing. It only reads without `editable`
// (public links), for files cut at 2 MB and for files that aren't UTF-8. `fill`: the page takes the height its
// host gives it, down to the bottom edge.
export default function CodeEditor({
  url,
  content,
  extension,
  editable = false,
  baseRevision = null,
  fileName = null,
  mimeType = null,
  minimap = false,
  deferNetwork = false,
  fill = false,
  onSave,
  onSaveStatusChange,
  onSaveController,
  onReload,
  onReady,
  onError,
  signal,
}) {
  const hostRef = useRef(null)
  const viewRef = useRef(null)
  // The text as the editor last held it, for a save that goes out after the editor has closed.
  const lastTextRef = useRef(null)
  const [loaded, setLoaded] = useState(null)
  const [scroller, setScroller] = useState(null)

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

        if (cancelled) return

        setLoaded(decodeText(buffer))
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

  const canEdit = Boolean(editable && onSave && loaded && !loaded.truncated && loaded.utf8)

  const saver = useContentAutosave({
    enabled: canEdit,
    baseRevision,
    fileName,
    mimeType,
    encoding: loaded,
    getText: () => viewRef.current?.state.doc.toString() ?? lastTextRef.current ?? loaded?.text ?? '',
    save: (attempt) => onSave(attempt),
  })
  const saverRef = useRef(saver)
  saverRef.current = saver

  useEffect(() => {
    if (!loaded || !hostRef.current) return undefined
    let cancelled = false
    let view = null

    // The editor loads on its own, when a file of code opens, so the rest of the app stays light.
    import('./codeEditorSetup.js')
      .then(({ createCodeEditor }) => {
        if (cancelled) return
        view = createCodeEditor({
          parent: hostRef.current,
          text: loaded.text,
          extension,
          editable: canEdit,
          minimap,
          onDocChanged: () => saverRef.current.markChanged(),
        })
        viewRef.current = view
        setScroller(view.scrollDOM)
        onReady?.()
      })
      .catch(() => {
        if (!cancelled) onError?.('Não foi possível abrir o editor.')
      })

    return () => {
      cancelled = true
      // What was typed but not saved yet goes out before the editor closes.
      if (view) lastTextRef.current = view.state.doc.toString()
      void saverRef.current.flush()
      viewRef.current = null
      view?.destroy()
    }
  }, [loaded, extension, canEdit, minimap, onReady, onError])

  const { state, label, error, flush, flushForClose, overwrite, discard } = saver

  useEffect(() => {
    if (!canEdit) return undefined
    onSaveStatusChange?.({ state, label, error })
  }, [canEdit, state, label, error, onSaveStatusChange])

  useEffect(() => {
    if (!canEdit) return undefined
    onSaveController?.({ flush, flushForClose })
    return () => onSaveController?.(null)
  }, [canEdit, flush, flushForClose, onSaveController])

  useEffect(() => {
    if (!canEdit) return undefined

    function onKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saverRef.current.flush()
      }
    }
    function onBeforeUnload(event) {
      if (!UNSAVED_STATES.has(saverRef.current.state)) return
      event.preventDefault()
      event.returnValue = ''
    }
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') void saverRef.current.flush()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [canEdit])

  const readOnlyNotice = loaded?.truncated
    ? 'Exibindo os primeiros 2 MB do arquivo, só para leitura.'
    : loaded && editable && !loaded.utf8
      ? 'Este arquivo não está em UTF-8 e abre só para leitura.'
      : null

  return (
    <div className={[styles.reader, fill ? styles.fill : ''].filter(Boolean).join(' ')}>
      {readOnlyNotice ? (
        <p className={styles.notice} role="status">
          {readOnlyNotice}
        </p>
      ) : null}
      {state === 'unsaved' && error ? (
        <p className={styles.notice} role="alert">
          {error}
        </p>
      ) : null}
      {state === 'conflict' ? (
        <div className={styles.conflict} role="alert">
          <p className={styles.conflictText}>{error ?? 'O arquivo foi alterado na nuvem.'}</p>
          <div className={styles.conflictActions}>
            <button
              type="button"
              className={styles.conflictAction}
              onClick={() => {
                discard()
                void onReload?.()
              }}
            >
              Recarregar
            </button>
            <button type="button" className={styles.conflictAction} onClick={() => void overwrite()}>
              Sobrescrever mesmo assim
            </button>
          </div>
        </div>
      ) : null}
      <CustomScrollArea className={styles.panel} horizontal scrollElement={scroller}>
        <div ref={hostRef} className={styles.host} data-code-editor="" />
      </CustomScrollArea>
    </div>
  )
}
