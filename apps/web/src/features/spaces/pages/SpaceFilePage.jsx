import { Navigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import AppShell from '../../../shared/components/AppShell/AppShell.jsx'
import OverflowMenu from '../../../shared/components/OverflowMenu/OverflowMenu.jsx'
import { ROUTES, providerUrl } from '../../../shared/config/routes.js'
import FileSheet from '../components/FileSheet/FileSheet.jsx'
import SpaceViewHeader from '../components/SpaceViewHeader/SpaceViewHeader.jsx'
import { getFile, getProvider } from '../../../shared/state/hubStore.js'
import { useHub } from '../../../shared/state/HubState.jsx'
import { fileMenuItems } from '../components/entryActions.js'
import styles from './SpaceFilePage.module.css'

export default function SpaceFilePage() {
  const { fileRef, provider: providerId } = useParams()
  const { state, dispatch, openOverlay } = useHub()
  const provider = providerId ? getProvider(state, providerId) : null
  const file = getFile(state, fileRef)

  if (!file || !provider) {
    return (
      <Navigate
        to={provider ? providerUrl(provider.id) : ROUTES.home}
        replace
      />
    )
  }

  return (
    <AppShell
      refreshKey={fileRef}
      subheader={
        <SpaceViewHeader
          trailing={
            <OverflowMenu
              ghost
              label={`Ações de ${file.title}`}
              items={fileMenuItems(file, { openOverlay, dispatch, state })}
            />
          }
        />
      }
    >
      <main className={styles.main}>
        <motion.div
          className={styles.stage}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <FileSheet large />
          <h1>{file.title}</h1>
          <p>
            {file.kind} · {file.provider}
          </p>
        </motion.div>
      </main>
    </AppShell>
  )
}
