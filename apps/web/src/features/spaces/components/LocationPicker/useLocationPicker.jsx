import { useEffect, useMemo, useState } from 'react'
import ProviderMark from '../ProviderMark.jsx'
import folderMark from '../../assets/folder.svg'
import {
  getFolder,
  getFolderContents,
  getProvider,
  getProviderContents,
  makeFolderLocationFromState,
} from '../../../../shared/state/hubStore.js'
import { useHub } from '../../../../shared/state/HubState.jsx'
import { overlayStyles as styles } from '../../../../shared/components/AppOverlay/AppOverlay.jsx'

export function useLocationPicker({
  excludeProviderId,
  initialProviderId = null,
  foldersOnly = false,
  onChoose,
  resetKey,
} = {}) {
  const { state } = useHub()
  const [providerId, setProviderId] = useState(initialProviderId)
  const [folderRef, setFolderRef] = useState(null)

  useEffect(() => {
    setProviderId(initialProviderId)
    setFolderRef(null)
  }, [resetKey, excludeProviderId, initialProviderId])

  const provider = providerId ? getProvider(state, providerId) : null
  const folder = folderRef ? getFolder(state, folderRef) : null
  const contents = provider
    ? folderRef
      ? getFolderContents(state, folderRef)
      : getProviderContents(state, provider.id)
    : { folders: [], files: [] }

  const providers = state.providers.filter((item) => item.id !== excludeProviderId)
  const currentLocation = useMemo(() => {
    if (!provider) return null
    if (folder) return makeFolderLocationFromState(state, folder.folderRef)
    return null
  }, [folder, provider, state])

  if (!provider) {
    return {
      picking: true,
      stage: 'providers',
      atRoot: true,
      title: 'Provedor',
      trailing: null,
      refreshKey: 'providers',
      body: (
        <div className={styles.stack} role="listbox" aria-label="Provedores">
          {providers.map((item) => (
            <button
              key={item.id}
              type="button"
              className={styles.pick}
              role="option"
              onClick={() => {
                setProviderId(item.id)
                setFolderRef(null)
              }}
            >
              <ProviderMark id={item.id} size={22} />
              <span className={styles.pickMeta}>
                <span className={styles.pickTitle}>{item.name}</span>
                <span className={styles.pickSub}>Pasta</span>
              </span>
            </button>
          ))}
        </div>
      ),
    }
  }

  const empty = contents.folders.length === 0 && (foldersOnly || contents.files.length === 0)
  const canChoose = Boolean(folder)

  return {
    picking: true,
    stage: 'browse',
    atRoot: !folder,
    title: folder?.name ?? provider.name,
    refreshKey: `${provider.id}-${folderRef ?? 'root'}`,
    trailing: (
      <button
        type="button"
        className={styles.choose}
        disabled={!canChoose}
        onClick={() => {
          if (!canChoose) return
          onChoose?.(currentLocation)
        }}
      >
        Escolher
      </button>
    ),
    body: (
      <>
        {folder ? (
          <nav className={styles.crumbs} aria-label="Localização atual">
            <button type="button" className={styles.crumb} onClick={() => setFolderRef(null)}>
              {provider.name}
            </button>
            <span className={styles.separator} aria-hidden="true">
              /
            </span>
          </nav>
        ) : initialProviderId ? null : (
          <button type="button" className={styles.more} onClick={() => setProviderId(null)}>
            Provedores
          </button>
        )}

        {empty ? (
          <p className={styles.empty}>Esta pasta está vazia.</p>
        ) : (
          <>
            {contents.folders.length > 0 ? (
              <div className={styles.grid}>
                {contents.folders.map((item) => (
                  <button
                    key={item.folderRef}
                    type="button"
                    className={styles.item}
                    onClick={() => setFolderRef(item.folderRef)}
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
                  </button>
                ))}
              </div>
            ) : null}
            {!foldersOnly && contents.files.length > 0 ? (
              <div className={styles.grid}>
                {contents.files.map((item) => (
                  <button
                    key={item.fileRef}
                    type="button"
                    className={styles.item}
                    onClick={() =>
                      onChoose?.(
                        item.folderRef
                          ? makeFolderLocationFromState(state, item.folderRef)
                          : null,
                      )
                    }
                  >
                    <span className={styles.face} aria-hidden="true">
                      <span className={styles.itemTitle}>{item.title}</span>
                    </span>
                    <span className={styles.meta}>
                      <span className={styles.itemTitle}>{item.title}</span>
                      <span className={styles.itemSub}>
                        {item.kind} · {item.provider}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </>
        )}
      </>
    ),
  }
}
