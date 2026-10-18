import googleDriveMark from '../assets/providers/google-drive.svg'
import oneDriveMark from '../assets/providers/onedrive.svg'
import styles from './ProviderMark.module.css'

const marks = {
  onedrive: oneDriveMark,
  'google-drive': googleDriveMark,
}

// Dropbox's own box glyph, without its blue tile, drawn in the theme's ink.
const DROPBOX_BOX = 'M43.7 32 23.404 44.75 43.701 57.5 64 44.75 84.3 57.5l20.298-12.75L84.299 32 64.002 44.75 43.7 32Zm0 51L23.404 70.25 43.701 57.5 64 70.25 43.702 83Zm20.302-12.75L84.299 57.5l20.298 12.75L84.299 83 64.002 70.25Zm0 29.75L43.7 87.25 64 74.5l20.3 12.75L64.002 100Z'

export default function ProviderMark({ id, size = 36 }) {
  if (id === 'dropbox') {
    return (
      <svg
        className={`${styles.mark} ${styles.glyph}`}
        width={size}
        height={size}
        viewBox="23.4 32 81.2 68"
        aria-hidden="true"
        focusable="false"
      >
        <path d={DROPBOX_BOX} />
      </svg>
    )
  }

  const src = marks[id]
  if (!src) return null

  return (
    <img
      className={styles.mark}
      src={src}
      width={size}
      height={size}
      alt=""
      draggable="false"
    />
  )
}
