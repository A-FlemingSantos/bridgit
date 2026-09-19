import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  isSettingsPath,
  resolveSettingsBackground,
} from '../../../../shared/utils/settingsOverlay.js'
import {
  getFile,
  getFolder,
  getFolderAncestry,
  getProvider,
  providerHasFolder,
} from '../../../../shared/state/hubStore.js'
import { useHub } from '../../../../shared/state/HubState.jsx'
import ProviderMark from '../ProviderMark.jsx'
import { resolveSpaceViewBreadcrumb } from './resolveSpaceViewBreadcrumb.js'
import styles from './SpaceViewHeader.module.css'

export default function SpaceViewHeader({
  trailing = null,
  items: itemsProp = null,
  onRename = null,
  subtitle = null,
  contained = false,
}) {
  const location = useLocation()
  const { state } = useHub()
  const pagePathname = isSettingsPath(location.pathname)
    ? resolveSettingsBackground(location).pathname
    : location.pathname
  const catalog = {
    getFile: (fileRef) => getFile(state, fileRef),
    getFolder: (folderRef) => getFolder(state, folderRef),
    getFolderAncestry: (folderRef) => getFolderAncestry(state, folderRef),
    getProvider: (id) => getProvider(state, id),
    providerHasFolder: (providerId, folderRef) => providerHasFolder(state, providerId, folderRef),
  }
  const { items } = itemsProp
    ? { items: itemsProp }
    : resolveSpaceViewBreadcrumb(pagePathname, catalog)
  const ancestors = items.filter((crumb) => !crumb.current)
  const current = items.find((crumb) => crumb.current) ?? items[items.length - 1]
  const [draft, setDraft] = useState(current?.label ?? '')

  useEffect(() => {
    setDraft(current?.label ?? '')
  }, [current?.label])

  function commitRename() {
    const name = draft.trim()
    if (!name) {
      setDraft(current?.label ?? '')
      return
    }
    if (name !== current?.label) onRename?.(name)
  }

  return (
    <header className={[styles.band, contained ? styles.contained : ''].filter(Boolean).join(' ')}>
      {ancestors.length > 0 ? (
        <nav className={styles.crumbs} aria-label="Localização atual">
          {ancestors.map((crumb, index) => (
            <span key={`${crumb.label}-${crumb.to ?? index}`} className={styles.crumbSegment}>
              <Link to={crumb.to} className={styles.crumb}>
                {crumb.label}
              </Link>
              {index < ancestors.length - 1 ? (
                <span className={styles.separator} aria-hidden="true">
                  /
                </span>
              ) : null}
            </span>
          ))}
        </nav>
      ) : null}
      <div className={styles.titleRow}>
        <div className={styles.titleBlock}>
          <h1>
            {onRename ? (
              <input
                className={styles.titleInput}
                value={draft}
                aria-label="Nome do space"
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    event.currentTarget.blur()
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setDraft(current?.label ?? '')
                    event.currentTarget.blur()
                  }
                }}
              />
            ) : (
              current?.label
            )}
            {current?.providerId ? (
              <ProviderMark id={current.providerId} size={36} />
            ) : null}
          </h1>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </div>
        {trailing}
      </div>
    </header>
  )
}
