import googleDriveMark from '../assets/providers/google-drive.svg'
import oneDriveMark from '../assets/providers/onedrive.svg'
import dropboxMark from '../assets/providers/dropbox.svg'
import styles from './ProviderMark.module.css'

const marks = {
  onedrive: oneDriveMark,
  'google-drive': googleDriveMark,
  dropbox: dropboxMark,
}

export default function ProviderMark({ id, size = 36 }) {
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
