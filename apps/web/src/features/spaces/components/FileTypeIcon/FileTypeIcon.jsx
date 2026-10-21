import { useId } from 'react'
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

export default function FileTypeIcon({ kind, large = false }) {
  const markup = marks[kind]
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  if (!markup) return null
  const className = [styles.mark, large ? styles.large : ''].filter(Boolean).join(' ')
  return (
    <span
      className={className}
      data-type={kind}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: scopedMarkup(markup, uid) }}
    />
  )
}
