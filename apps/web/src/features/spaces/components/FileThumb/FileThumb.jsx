import { useEffect, useRef, useState } from 'react'
import { useHubActions } from '../../../../shared/hub/index.js'
import FileSheet from '../FileSheet/FileSheet.jsx'
import FileTypeIcon from '../FileTypeIcon/FileTypeIcon.jsx'
import styles from './FileThumb.module.css'
import { officeBadge, previewSettling, thumbnailEligible } from './thumbnailEligibility.js'
import { loadThumbnail } from '../../../../shared/hub/thumbnailQueue.js'
import { fitThumbnail } from './thumbnailResize.js'

export default function FileThumb({ file, providerId, showTypeIcon = false, align = 'end', fit = 'contain' }) {
  const { getThumbnail, getStoredThumbnail } = useHubActions()
  const rootRef = useRef(null)
  const [visible, setVisible] = useState(false)
  const [url, setUrl] = useState(null)
  const [box, setBox] = useState({ width: 0, height: 0, measured: false })
  const eligible = thumbnailEligible(providerId, file)
  const kind = officeBadge(file)
  // Native Google files carry no content revision; their version is the modification time.
  const revision = file?.contentRevision ?? file?.remoteVersion ?? null
  const ref = file?.ref
  const settling = previewSettling(file)

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

  // The preview is drawn at the tile's own size. The same thumb can move from a list row to a grid
  // tile, so the size is watched (layout size, untouched by entrance transforms) rather than read once.
  useEffect(() => {
    const node = rootRef.current
    if (!node || !eligible) return undefined
    setBox({ width: node.offsetWidth, height: node.offsetHeight, measured: true })
    if (typeof ResizeObserver !== 'function') return undefined
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width)
      const height = Math.round(entry.contentRect.height)
      setBox((prev) => (prev.width === width && prev.height === height && prev.measured ? prev : { width, height, measured: true }))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [eligible])

  useEffect(() => {
    if (!visible || !eligible || !box.measured || typeof getThumbnail !== 'function' || !ref) return undefined
    let cancelled = false
    // Each size of tile keeps its own copy.
    const { width, height } = box
    const scale = globalThis.devicePixelRatio || 1
    const key = `${providerId}\0${ref}\0${revision ?? ''}\0${fit}:${width}x${height}@${scale}`
    const readStored = typeof getStoredThumbnail === 'function' ? () => getStoredThumbnail(providerId, ref, revision) : null
    const transform = (blob) => fitThumbnail(blob, { width, height, fit, scale })
    const fetchBlob = () => getThumbnail(providerId, ref, revision, { keep: !settling })
    loadThumbnail(key, fetchBlob, readStored, transform, { keep: !settling }).then((next) => {
      if (!cancelled) setUrl(next)
    })
    return () => {
      cancelled = true
    }
  }, [visible, eligible, box, getThumbnail, getStoredThumbnail, providerId, ref, revision, fit, settling])

  const cornerBadge = url && showTypeIcon ? kind : null

  return (
    <span ref={rootRef} className={styles.root} data-align={align} data-fit={fit}>
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
