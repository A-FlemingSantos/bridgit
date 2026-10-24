import { useEffect, useRef, useState } from 'react'
import { useHubDataContext } from '../../hub/HubDataProvider.jsx'
import { findCachedItem } from '../../hub/hubCache.js'
import styles from './OperationNotices.module.css'

const VISIBLE_MS = 8000

const VERBS = {
  CREATE_FOLDER: 'criar a pasta',
  UPLOAD: 'enviar',
  UPDATE: 'alterar',
  DELETE: 'excluir',
  REPLACE_CONTENT: 'salvar',
}

// cachedName: the item's name from the catalog, for refusals that name no file (a save listed by the server).
export function rejectionNotice(operation, cachedName) {
  const verb = VERBS[operation.request?.kind] ?? 'concluir a alteração em'
  const name = operation.request?.name ?? operation.localItem?.name ?? cachedName
  const subject = name ? `"${name}"` : 'o item'
  const reason = operation.errorMessage ? ` ${operation.errorMessage}` : ''
  return `Não foi possível ${verb} ${subject}.${reason}`
}

// Operations seen pending that are now refused. An operation that is already refused the first time it
// shows up (the history loaded with the page) is not news. A refusal at submit time is shown by the form
// that is still open, so local intents ("client:") are left out.
export function freshRejections(previousStatuses, operations) {
  return operations.filter((op) => op.status === 'REJECTED'
    && !String(op.id).startsWith('client:')
    && previousStatuses.has(op.id)
    && previousStatuses.get(op.id) !== 'REJECTED')
}

// Forms close as soon as the server accepts a change. When the provider later refuses it, the pending
// item just disappears from the list; this says why.
export default function OperationNotices() {
  const { durableOperations, actions, folderCache, itemCache } = useHubDataContext()
  const [notices, setNotices] = useState([])
  const statusesRef = useRef(new Map())
  const cachesRef = useRef({ folderCache, itemCache })
  cachesRef.current = { folderCache, itemCache }

  useEffect(() => {
    const operations = Object.values(durableOperations ?? {})
    // A save the open editor already reports on its own is not announced a second time.
    const fresh = freshRejections(statusesRef.current, operations).filter((op) => !actions?.isOperationAttended?.(op))
    statusesRef.current = new Map(operations.map((op) => [op.id, op.status]))
    if (fresh.length === 0) return
    const { folderCache: folders, itemCache: items } = cachesRef.current
    setNotices((current) => [...current, ...fresh.map((op) => ({
      id: op.id,
      text: rejectionNotice(op, op.request?.ref ? findCachedItem(folders ?? {}, items ?? {}, op.request.connectionId, op.request.ref)?.name : undefined),
    }))])
  }, [durableOperations, actions])

  useEffect(() => {
    if (notices.length === 0) return undefined
    const timer = window.setTimeout(() => setNotices((current) => current.slice(1)), VISIBLE_MS)
    return () => window.clearTimeout(timer)
  }, [notices])

  if (notices.length === 0) return null

  return (
    <div className={styles.stack} role="status">
      {notices.map((notice) => (
        <div key={notice.id} className={styles.notice}>
          <p>{notice.text}</p>
          <button
            type="button"
            className={styles.dismiss}
            onClick={() => setNotices((current) => current.filter((item) => item.id !== notice.id))}
          >
            Dispensar
          </button>
        </div>
      ))}
    </div>
  )
}
