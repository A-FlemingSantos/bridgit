import { Download } from 'lucide-react'
import styles from './FileReader.module.css'

export default function DownloadAction({ onDownload, downloadUrl, label = 'Baixar' }) {
  if (!onDownload && !downloadUrl) {
    return null
  }

  function handleClick() {
    if (onDownload) {
      onDownload()
      return
    }

    if (downloadUrl) {
      window.open(downloadUrl, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <button type="button" className={styles.download} onClick={handleClick}>
      <Download size={15} aria-hidden="true" />
      {label}
    </button>
  )
}
