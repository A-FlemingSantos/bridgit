import { useEffect, useRef, useState } from 'react'
import { useHubActions } from '../../../../shared/hub/index.js'
import FileSheet from '../FileSheet/FileSheet.jsx'
import FileTypeIcon from '../FileTypeIcon/FileTypeIcon.jsx'
import styles from './FileThumb.module.css'
import { officeBadge, thumbnailEligible } from './thumbnailEligibility.js'
import { loadThumbnail } from './thumbnailQueue.js'

export default function FileThumb({ file, providerId, showTypeIcon = false, align = 'end' }) {
  const { getThumbnail, getStoredThumbnail } = useHubActions()
  const rootRef = useRef(null)
  const [visible, setVisible] = useState(false)
  const [url, setUrl] = useState(null)
  const eligible = thumbnailEligible(providerId, file)
  const kind = officeBadge(file)
  // Native Google files carry no content revision; their version is the modification time.
  const revision = file?.contentRevision ?? file?.remoteVersion ?? null
  const ref = file?.ref

  useEffect(() => {
    const node = rootRef.current
    if (!node || !eligible) return undefined
    if (typeof IntersectionObserver !== 'function') {
      setVisible(true)
      return undefined
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisible(true)
    }, { rootMargin: '240px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [eligible, providerId, ref])

  useEffect(() => {
    if (!visible || !eligible || typeof getThumbnail !== 'function' || !ref) return undefined
    let cancelled = false
    const key = `${providerId}\0${ref}\0${revision ?? ''}`
    const readStored = typeof getStoredThumbnail === 'function' ? () => getStoredThumbnail(providerId, ref, revision) : null
    loadThumbnail(key, () => getThumbnail(providerId, ref, revision), readStored).then((next) => {
      if (!cancelled) setUrl(next)
    })
    return () => {
      cancelled = true
    }
  }, [visible, eligible, getThumbnail, getStoredThumbnail, providerId, ref, revision])

  const cornerBadge = url && showTypeIcon ? kind : null

  return (
    <span ref={rootRef} className={styles.root} data-align={align}>
      {url ? (
        <span className={styles.imageFrame}>
          <img className={styles.preview} src={url} alt="" />
          {cornerBadge ? (
            <span className={styles.badge}>
              <FileTypeIcon kind={cornerBadge} />
            </span>
          ) : null}
        </span>
      ) : kind ? (
        <span className={styles.fallback}>
          <FileTypeIcon kind={kind} large />
        </span>
      ) : (
        <span className={styles.sheet}>
          <FileSheet file={file} />
        </span>
      )}
    </span>
  )
}
