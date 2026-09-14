import { Navigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import AppShell from '../../../shared/components/AppShell/AppShell.jsx'
import { ROUTES, spaceUrl } from '../../../shared/config/routes.js'
import FileSheet from '../components/FileSheet/FileSheet.jsx'
import SpaceViewHeader from '../components/SpaceViewHeader/SpaceViewHeader.jsx'
import { getFile, getSpace } from '../data/mock.js'
import styles from './SpaceFilePage.module.css'

export default function SpaceFilePage() {
  const { space: spaceSlug, fileRef } = useParams()
  const space = getSpace(spaceSlug)
  const file = getFile(fileRef)

  if (!space || !file) {
    return <Navigate to={space ? spaceUrl(space.slug) : ROUTES.spaces} replace />
  }

  return (
    <AppShell
      refreshKey={fileRef}
      subheader={
        <SpaceViewHeader
          backTo={spaceUrl(space.slug)}
          backLabel={space.name}
          title={file.title}
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
          <p>
            {file.kind} · {file.provider}
          </p>
        </motion.div>
      </main>
    </AppShell>
  )
}
