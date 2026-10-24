import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { encodeText } from './textDocument.js'

const AUTOSAVE_DELAY_MS = 1500
// After an outcome we can't tell (network, provider busy), the same attempt goes again, further apart each time.
const RETRY_DELAYS_MS = [3000, 6000, 12000, 24000, 48000, 60000]
const CLOSE_BLOCKED_MESSAGE = 'As alterações não foram salvas. Feche de novo para sair sem salvar.'

const LABELS = {
  pending: 'Salvando…',
  saving: 'Salvando…',
  saved: 'Salvo',
  unsaved: 'Não salvo',
  conflict: 'Não salvo',
}

const TRANSIENT_CODES = new Set(['ARQUIVO_BLOQUEADO', 'ERRO_CONEXAO', 'OPERACAO_EM_VERIFICACAO'])

function classify(error) {
  if (error?.code === 'ARQUIVO_ALTERADO') return 'conflict'
  const status = error?.status
  if (TRANSIENT_CODES.has(error?.code) || !status || status === 423 || status === 429 || status >= 500) return 'retry'
  return 'permanent'
}

function messageOf(error) {
  if (error?.code === 'ARQUIVO_ALTERADO') return 'O arquivo foi alterado na nuvem.'
  return error?.message || 'Não foi possível salvar o arquivo.'
}

// Saves an edited text on its own: a moment after typing stops, at once on request (Ctrl+S, closing), one save
// at a time and always with the latest text. A conflict with the cloud stops it until the user picks a way out.
// States: clean, pending (waiting to save), saving, saved, unsaved (failed), conflict.
export default function useContentAutosave({
  enabled,
  baseRevision,
  fileName,
  mimeType,
  encoding,
  getText,
  save,
  delayMs = AUTOSAVE_DELAY_MS,
}) {
  const [state, setState] = useState('clean')
  const [error, setError] = useState(null)
  const stateRef = useRef('clean')
  const baseRef = useRef(baseRevision)
  const editVersionRef = useRef(0)
  const savedVersionRef = useRef(0)
  const timerRef = useRef(null)
  const inFlightRef = useRef(null)
  const retryAttemptRef = useRef(null)
  const retryCountRef = useRef(0)
  const discardedRef = useRef(false)
  const pausedRef = useRef(false)
  const closeBlockedRef = useRef(false)
  const mountedRef = useRef(true)
  const optionsRef = useRef(null)
  optionsRef.current = { enabled, fileName, mimeType, encoding, getText, save, delayMs }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      window.clearTimeout(timerRef.current)
    }
  }, [])

  const update = useCallback((nextState, nextError = null) => {
    stateRef.current = nextState
    setState(nextState)
    setError(nextError)
  }, [])

  const newAttempt = useCallback((overwrite = false) => {
    const { fileName: name, mimeType: type, encoding: textEncoding, getText: read } = optionsRef.current
    return {
      file: new File([encodeText(read(), textEncoding)], name || 'arquivo.txt', { type: type || 'text/plain' }),
      baseRevision: baseRef.current,
      version: editVersionRef.current,
      overwrite,
    }
  }, [])

  const flushRef = useRef(null)

  const schedule = useCallback((ms) => {
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => void flushRef.current?.(), ms)
  }, [])

  const run = useCallback((attempt) => {
    update('saving')
    const request = optionsRef.current
      .save({
        file: attempt.file,
        baseRevision: attempt.baseRevision,
        overwrite: attempt.overwrite,
        isAttended: () => mountedRef.current,
      })
      .then(
        ({ revision }) => {
          baseRef.current = revision
          savedVersionRef.current = attempt.version
          retryAttemptRef.current = null
          retryCountRef.current = 0
          closeBlockedRef.current = false
          pausedRef.current = false
          if (discardedRef.current) return true
          if (editVersionRef.current === attempt.version) {
            update('saved')
          } else {
            update('pending')
            schedule(optionsRef.current.delayMs)
          }
          return true
        },
        (failure) => {
          if (discardedRef.current) return false
          const kind = classify(failure)
          if (kind === 'conflict') {
            retryAttemptRef.current = null
            update('conflict', messageOf(failure))
          } else if (kind === 'retry') {
            // The same attempt (same file, same request key) goes again, so a save that did land isn't doubled.
            retryAttemptRef.current = attempt
            const delay = RETRY_DELAYS_MS[Math.min(retryCountRef.current, RETRY_DELAYS_MS.length - 1)]
            retryCountRef.current += 1
            update('unsaved', messageOf(failure))
            schedule(delay)
          } else {
            // A refusal that won't change on its own (no permission, too large): typing doesn't try again,
            // only an explicit save (Ctrl+S, closing) does.
            retryAttemptRef.current = null
            pausedRef.current = true
            update('unsaved', messageOf(failure))
          }
          return false
        },
      )
      .finally(() => {
        inFlightRef.current = null
      })
    inFlightRef.current = request
    return request
  }, [schedule, update])

  const flush = useCallback(() => {
    window.clearTimeout(timerRef.current)
    if (discardedRef.current || !optionsRef.current.enabled) return Promise.resolve(true)
    if (stateRef.current === 'conflict') return Promise.resolve(false)
    if (inFlightRef.current) return inFlightRef.current.then(() => flushRef.current())
    if (!retryAttemptRef.current && editVersionRef.current === savedVersionRef.current) return Promise.resolve(true)
    pausedRef.current = false
    return run(retryAttemptRef.current ?? newAttempt())
  }, [newAttempt, run])
  flushRef.current = flush

  const markChanged = useCallback(() => {
    if (!optionsRef.current.enabled || discardedRef.current) return
    editVersionRef.current += 1
    closeBlockedRef.current = false
    if (stateRef.current === 'conflict' || pausedRef.current) return
    if (stateRef.current !== 'saving') update('pending')
    // A failed attempt still waiting for its retry goes first; the newer text follows once it settles.
    if (!retryAttemptRef.current) schedule(optionsRef.current.delayMs)
  }, [schedule, update])

  const overwrite = useCallback(() => {
    if (discardedRef.current || inFlightRef.current) return Promise.resolve(false)
    window.clearTimeout(timerRef.current)
    return run(newAttempt(true))
  }, [newAttempt, run])

  const discard = useCallback(() => {
    discardedRef.current = true
    window.clearTimeout(timerRef.current)
  }, [])

  // Resolves true when the file may close: nothing left to save, the save went through, or the user closes again
  // after being told the changes would be lost.
  const flushForClose = useCallback(async () => {
    if (discardedRef.current || !optionsRef.current.enabled) return true
    const clean = () => !inFlightRef.current && !retryAttemptRef.current && editVersionRef.current === savedVersionRef.current
    if (clean() && stateRef.current !== 'conflict') return true
    if (closeBlockedRef.current) return true
    await flushRef.current()
    if (clean() && stateRef.current !== 'conflict') return true
    closeBlockedRef.current = true
    update(stateRef.current === 'conflict' ? 'conflict' : 'unsaved', CLOSE_BLOCKED_MESSAGE)
    return false
  }, [update])

  return useMemo(
    () => ({ state, label: LABELS[state] ?? null, error, markChanged, flush, flushForClose, overwrite, discard }),
    [state, error, markChanged, flush, flushForClose, overwrite, discard],
  )
}
