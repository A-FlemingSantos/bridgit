import { useEffect, useState } from 'react'
import ProviderMark from '../../../features/spaces/components/ProviderMark.jsx'
import { accountInitials } from './initials.js'
import { useConnectionAvatar } from './useConnectionAvatar.js'
import styles from './AccountAvatar.module.css'

// A connected account as its profile photo (initials when it has none) with the provider's
// mark as a small badge on the bottom-right corner. Decorative: the row around it names the account.
export default function AccountAvatar({ connection, size = 24 }) {
  const src = useConnectionAvatar(connection)
  const [failedSrc, setFailedSrc] = useState(null)
  const showPhoto = Boolean(src) && failedSrc !== src
  const initials = accountInitials(connection?.account)
  const badge = Math.max(10, Math.round(size * 0.5))

  useEffect(() => {
    setFailedSrc(null)
  }, [src])

  return (
    <span className={styles.root} style={{ width: size, height: size }} aria-hidden="true">
      {showPhoto ? (
        <img
          className={styles.photo}
          src={src}
          alt=""
          draggable="false"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span className={styles.initials} style={{ fontSize: Math.max(9, Math.round(size * 0.4)) }}>
          {initials}
        </span>
      )}
      <span className={styles.badge} data-testid="account-avatar-badge">
        <ProviderMark id={connection?.provider} size={badge} />
      </span>
    </span>
  )
}
