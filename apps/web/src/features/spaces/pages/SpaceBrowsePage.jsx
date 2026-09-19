import { useRef } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { FilePen, FolderPlus, PenLine, Stamp, Upload } from 'lucide-react'
import AppShell from '../../../shared/components/AppShell/AppShell.jsx'
import OverflowMenu from '../../../shared/components/OverflowMenu/OverflowMenu.jsx'
import {
  ROUTES,
  providerFileUrl,
  providerFolderUrl,
  providerUrl,
} from '../../../shared/config/routes.js'
import FileSheet from '../components/FileSheet/FileSheet.jsx'
import SpaceViewActions from '../components/SpaceViewActions/SpaceViewActions.jsx'
import SpaceViewHeader from '../components/SpaceViewHeader/SpaceViewHeader.jsx'
import folderMark from '../assets/folder.svg'
import {
  getFolder,
  getFolderContents,
  getProvider,
  getProviderContents,
  makeFolderLocationFromState,
} from '../../../shared/state/hubStore.js'
import { useHub } from '../../../shared/state/HubState.jsx'
import { fileMenuItems, folderMenuItems } from '../components/entryActions.js'
import styles from './SpaceBrowsePage.module.css'

const rise = {
  hidden: { opacity: 0, y: 10 },
  show: (delay) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] },
  }),
}

export default function SpaceBrowsePage() {
  const { folderRef, provider: providerId } = useParams()
  const { state, dispatch, openOverlay } = useHub()
  const uploadRef = useRef(null)
  const provider = providerId ? getProvider(state, providerId) : null
  const folder = folderRef ? getFolder(state, folderRef) : null

  if (!provider) {
    return <Navigate to={ROUTES.home} replace />
  }

  if (folderRef && !folder) {
    return <Navigate to={providerUrl(provider.id)} replace />
  }

  const contents = folderRef
    ? getFolderContents(state, folderRef)
    : getProviderContents(state, provider.id)
  const empty = contents.folders.length === 0 && contents.files.length === 0

  function nameOverlay(kind) {
    openOverlay({
      type: 'name',
      kind,
      providerId: provider.id,
      folderRef: folderRef ?? null,
    })
  }

  function onUpload(event) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    files.forEach((file) => {
      const title = file.name.replace(/\.[^.]+$/, '') || file.name
      const ext = file.name.split('.').pop()
      dispatch({
        type: 'createFile',
        title,
        providerId: provider.id,
        parentFolderRef: folderRef ?? null,
        kind: ext ? ext.toUpperCase() : 'PDF',
      })
    })
  }

  return (
    <AppShell
      refreshKey={`${providerId}-${folderRef ?? 'root'}`}
      subheader={
        <SpaceViewHeader
          trailing={
            <SpaceViewActions
              onCreate={() => nameOverlay('file')}
              extras={[
                {
                  id: 'upload',
                  label: 'Enviar',
                  icon: Upload,
                  onSelect: () => uploadRef.current?.click(),
                },
                {
                  id: 'folder',
                  label: 'Nova pasta',
                  icon: FolderPlus,
                  onSelect: () => nameOverlay('folder'),
                },
                { id: 'edit', label: 'Editar PDF', icon: FilePen },
                { id: 'sign-req', label: 'Pedir assinaturas', icon: Stamp },
                { id: 'sign', label: 'Assinar', icon: PenLine },
              ]}
            />
          }
        />
      }
    >
      <main className={styles.main}>
        <input
          ref={uploadRef}
          type="file"
          hidden
          multiple
          onChange={onUpload}
        />

        {empty ? <p className={styles.empty}>Esta pasta está vazia.</p> : null}

        {contents.folders.length > 0 ? (
          <section className={styles.section}>
            <h2>Pastas</h2>
            <div className={styles.grid}>
              {contents.folders.map((item, index) => (
                <motion.div
                  key={item.folderRef}
                  className={styles.wrap}
                  variants={rise}
                  initial="hidden"
                  animate="show"
                  custom={0.06 + index * 0.04}
                >
                  <Link
                    to={providerFolderUrl(providerId, item.folderRef)}
                    className={styles.item}
                  >
                    <span className={styles.face} aria-hidden="true">
                      <span
                        className={styles.folderMark}
                        style={{ '--folder-mark': `url("${folderMark}")` }}
                      />
                    </span>
                    <span className={styles.meta}>
                      <span className={styles.itemTitle}>{item.name}</span>
                      <span className={styles.itemSub}>Pasta · {item.provider}</span>
                    </span>
                  </Link>
                  <OverflowMenu
                    floating
                    hoverReveal
                    label={`Ações de ${item.name}`}
                    items={folderMenuItems(
                      { ...item, origin: makeFolderLocationFromState(state, item.folderRef) },
                      { openOverlay },
                    )}
                  />
                </motion.div>
              ))}
            </div>
          </section>
        ) : null}

        {contents.files.length > 0 ? (
          <section className={styles.section}>
            <h2>Arquivos</h2>
            <div className={styles.grid}>
              {contents.files.map((item, index) => (
                <motion.div
                  key={item.fileRef}
                  className={styles.wrap}
                  variants={rise}
                  initial="hidden"
                  animate="show"
                  custom={0.14 + index * 0.03}
                >
                  <Link
                    to={providerFileUrl(providerId, item.fileRef)}
                    className={styles.item}
                  >
                    <span className={styles.face} aria-hidden="true">
                      <FileSheet />
                    </span>
                    <span className={styles.meta}>
                      <span className={styles.itemTitle}>{item.title}</span>
                      <span className={styles.itemSub}>
                        {item.kind} · {item.provider}
                      </span>
                    </span>
                  </Link>
                  <OverflowMenu
                    floating
                    hoverReveal
                    label={`Ações de ${item.title}`}
                    items={fileMenuItems(item, { openOverlay, dispatch, state })}
                  />
                </motion.div>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </AppShell>
  )
}
