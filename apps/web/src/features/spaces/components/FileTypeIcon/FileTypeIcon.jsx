import { useEffect, useState } from 'react'
import styles from './FileTypeIcon.module.css'
import {
  EXCEL_MARK,
  GOOGLE_DOCS_MARK,
  GOOGLE_SHEETS_MARK,
  GOOGLE_SLIDES_MARK,
  POWERPOINT_MARK,
  WORD_MARK,
} from './fileTypeMarks.js'

const marks = {
  word: WORD_MARK,
  excel: EXCEL_MARK,
  powerpoint: POWERPOINT_MARK,
  'google-docs': GOOGLE_DOCS_MARK,
  'google-sheets': GOOGLE_SHEETS_MARK,
  'google-slides': GOOGLE_SLIDES_MARK,
}

const SUPERSAMPLE = 8
const EDGE_BLUR = 'blur(0.5px)'

// One bitmap per mark and size, shared by every icon on screen and kept for the session: drawing it on each
// mount ran the 8× canvas once per Office file, which stalled a page of tiles as it appeared.
const rendered = new Map()
const pending = new Map()

// Rasterizes the icon large, then reduces it with a soft edge. A one-pixel
// fringe still steps on a 48px circle; the blur spreads that fringe.
function rasterize(markup, pixels) {
  return new Promise((resolve) => {
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
      out.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : null), 'image/png')
    }
    image.onerror = () => {
      URL.revokeObjectURL(svgUrl)
      resolve(null)
    }
    image.src = svgUrl
  })
}

function smoothMark(kind, pixels) {
  const key = `${kind}:${pixels}`
  if (!pending.has(key)) {
    pending.set(key, rasterize(marks[kind], pixels).then((url) => {
      if (url) rendered.set(key, url)
      else pending.delete(key)
      return url
    }))
  }
  return pending.get(key)
}

function useSmoothMark(kind, pixels) {
  const key = `${kind}:${pixels}`
  const [state, setState] = useState(() => ({ key, url: rendered.get(key) ?? null }))

  useEffect(() => {
    if (!marks[kind] || rendered.has(key)) return undefined
    let cancelled = false
    smoothMark(kind, pixels).then((url) => {
      if (!cancelled) setState({ key, url })
    })
    return () => {
      cancelled = true
    }
  }, [kind, pixels, key])

  return state.key === key ? state.url : rendered.get(key) ?? null
}

export default function FileTypeIcon({ kind, large = false }) {
  const markup = marks[kind]
  const pixels = large ? 48 : 22
  const url = useSmoothMark(kind, pixels)
  if (!markup) return null
  const className = [styles.mark, large ? styles.large : ''].filter(Boolean).join(' ')
  return (
    <span className={className} data-type={kind} aria-hidden="true">
      {url ? <img className={styles.bitmap} src={url} alt="" draggable="false" /> : null}
    </span>
  )
}
