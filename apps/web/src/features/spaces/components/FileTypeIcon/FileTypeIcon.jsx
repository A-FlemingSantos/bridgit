import { useEffect, useId, useRef, useState } from 'react'
import styles from './FileTypeIcon.module.css'
import { EXCEL_MARK, POWERPOINT_MARK, WORD_MARK } from './fileTypeMarks.js'

const marks = {
  word: WORD_MARK,
  excel: EXCEL_MARK,
  powerpoint: POWERPOINT_MARK,
}

function scopedMarkup(markup, uid) {
  return markup
    .replace(/\bid="([^"]+)"/g, (_, id) => `id="${uid}-${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${uid}-${id})`)
}

const SUPERSAMPLE = 8
const EDGE_BLUR = 'blur(0.5px)'

// Rasterizes the icon large, then reduces it with a soft edge. A one-pixel
// fringe still steps on a 48px circle; the blur spreads that fringe.
function useSmoothMark(markup, pixels) {
  const [url, setUrl] = useState(null)
  const urlRef = useRef(null)

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
  }, [])

  useEffect(() => {
    if (!markup) return undefined
    let cancelled = false
    const size = pixels * SUPERSAMPLE
    const sized = markup.replace('<svg ', `<svg width="${size}" height="${size}" `)
    const svgUrl = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml;charset=utf-8' }))
    const image = new Image()
    image.onload = () => {
      const hi = document.createElement('canvas')
      hi.width = size
      hi.height = size
      hi.getContext('2d').drawImage(image, 0, 0, size, size)
      URL.revokeObjectURL(svgUrl)
      const out = document.createElement('canvas')
      out.width = pixels
      out.height = pixels
      const ctx = out.getContext('2d')
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.filter = EDGE_BLUR
      ctx.drawImage(hi, 0, 0, pixels, pixels)
      out.toBlob((blob) => {
        if (cancelled || !blob) return
        const next = URL.createObjectURL(blob)
        urlRef.current = next
        setUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous)
          return next
        })
      }, 'image/png')
    }
    image.onerror = () => URL.revokeObjectURL(svgUrl)
    image.src = svgUrl
    return () => {
      cancelled = true
    }
  }, [markup, pixels])

  return url
}

export default function FileTypeIcon({ kind, large = false }) {
  const markup = marks[kind]
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const pixels = large ? 48 : 22
  const url = useSmoothMark(markup ? scopedMarkup(markup, uid) : '', pixels)
  if (!markup) return null
  const className = [styles.mark, large ? styles.large : ''].filter(Boolean).join(' ')
  return (
    <span className={className} data-type={kind} aria-hidden="true">
      {url ? <img className={styles.bitmap} src={url} alt="" draggable="false" /> : null}
    </span>
  )
}
