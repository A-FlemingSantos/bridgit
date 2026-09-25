import { useEffect, useMemo, useState } from 'react'
import ProviderMark from '../ProviderMark.jsx'
import FileSheet from '../FileSheet/FileSheet.jsx'
import folderMark from '../../assets/folder.svg'
import {
  getFolder,
  getFolderAncestry,
  getFolderContents,
  getProvider,
  getProviderContents,
  makeFolderLocationFromState,
  makeRootLocation,
} from '../../../../shared/state/hubStore.js'
import { useHub } from '../../../../shared/state/HubState.jsx'
import { useFolder, useProviders } from '../../../../shared/hub/index.js'
import { overlayStyles as styles } from '../../../../shared/components/AppOverlay/AppOverlay.jsx'

export function useLocationPicker({
  source = 'mock',
  excludeProviderId,
  disabledFolderRef = null,
  disabledFolderRefs = [],
  initialProviderId = null,
  foldersOnly = false,
  allowRoot = false,
  blockedHint = 'Esta pasta já é o outro lado',
  onChoose,
  resetKey,
} = {}) {
  if (source === 'api') {
    return useApiLocationPicker({
      excludeProviderId,
      disabledFolderRef,
      disabledFolderRefs,
      initialProviderId,
      allowRoot,
      blockedHint,
      onChoose,
      resetKey,
    })
  }

  return useMockLocationPicker({
    excludeProviderId,
    disabledFolderRef,
    disabledFolderRefs,
    initialProviderId,
    foldersOnly,
    allowRoot,
    blockedHint,
    onChoose,
    resetKey,
  })
}

function useMockLocationPicker({
  excludeProviderId,
  disabledFolderRef = null,
  disabledFolderRefs = [],
  initialProviderId = null,
  foldersOnly = false,
  allowRoot = false,
  blockedHint = 'Esta pasta já é o outro lado',
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
  const blockedRefs = [disabledFolderRef, ...disabledFolderRefs].filter(Boolean)
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

  const empty = contents.folders.length === 0 && contents.files.length === 0
  const currentBlocked = Boolean(folderRef && blockedRefs.includes(folderRef))
  const canChoose = folder ? !currentBlocked : allowRoot
  const chosenLocation = folder ? currentLocation : makeRootLocation(provider)
  const parents = folder ? getFolderAncestry(state, folder.folderRef).slice(0, -1) : []

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
        title={currentBlocked ? blockedHint : undefined}
        onClick={() => {
          if (!canChoose) return
          onChoose?.(chosenLocation)
        }}
      >
        Escolher
      </button>
    ),
    body: (
      <>
        {folder ? (
          <nav className={styles.crumbs} aria-label="Localização atual">
            <span className={styles.crumbSegment}>
              <button type="button" className={styles.crumb} onClick={() => setFolderRef(null)}>
                {provider.name}
              </button>
              {parents.length > 0 ? (
                <span className={styles.separator} aria-hidden="true">
                  /
                </span>
              ) : null}
            </span>
            {parents.map((item, index) => (
              <span key={item.folderRef} className={styles.crumbSegment}>
                <button type="button" className={styles.crumb} onClick={() => setFolderRef(item.folderRef)}>
                  {item.name}
                </button>
                {index < parents.length - 1 ? (
                  <span className={styles.separator} aria-hidden="true">
                    /
                  </span>
                ) : null}
              </span>
            ))}
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
                {contents.folders.map((item) => {
                  const blocked = blockedRefs.includes(item.folderRef)
                  return (
                    <button
                      key={item.folderRef}
                      type="button"
                      className={styles.item}
                      disabled={blocked}
                      title={blocked ? blockedHint : undefined}
                      onClick={() => {
                        if (blocked) return
                        setFolderRef(item.folderRef)
                      }}
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
                  )
                })}
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
                        item.folderRef ? makeFolderLocationFromState(state, item.folderRef) : null,
                      )
                    }
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

function useApiLocationPicker({
  disabledFolderRef = null,
  disabledFolderRefs = [],
  initialProviderId = null,
  allowRoot = false,
  blockedHint = 'Não dá para mover para cá',
  onChoose,
  resetKey,
} = {}) {
  const { providers } = useProviders()
  const [folderRef, setFolderRef] = useState(null)
  const providerId = initialProviderId
  const provider = providers.find((item) => item.id === providerId) ?? null
  const folderQuery = useFolder(providerId, folderRef)

  useEffect(() => {
    setFolderRef(null)
  }, [resetKey, initialProviderId])

  const blockedRefs = [disabledFolderRef, ...disabledFolderRefs].filter(Boolean)
  const folders = folderQuery.items.filter((item) => item.kind === 'folder')
  const parents = folderRef ? (folderQuery.folder?.ancestry ?? []) : []
  const currentFolder =
    folderRef && folderQuery.folder
      ? { ref: folderQuery.folder.ref, name: folderQuery.folder.name }
      : null
  const currentBlocked = Boolean(folderRef && blockedRefs.includes(folderRef))
  const canChoose = currentFolder ? !currentBlocked : allowRoot

  const chosenLocation = provider
    ? currentFolder
      ? {
          kind: 'folder',
          ref: currentFolder.ref,
          name: currentFolder.name,
          providerId: provider.id,
          provider: provider.name,
        }
      : makeRootLocation(provider)
    : null

  if (!provider) {
    return {
      picking: true,
      stage: 'providers',
      atRoot: true,
      title: 'Provedor',
      trailing: null,
      refreshKey: 'providers',
      body: <p className={styles.empty}>Provedor indisponível.</p>,
    }
  }

  let bodyContent = null

  if (folderQuery.status === 'loading' || folderQuery.status === 'idle') {
    bodyContent = <p className={styles.empty}>Carregando…</p>
  } else if (folderQuery.status === 'error') {
    bodyContent = (
      <>
        <p className={styles.hint} role="alert">
          Não foi possível carregar as pastas.
        </p>
        <button type="button" className={styles.more} onClick={() => folderQuery.reload()}>
          Tentar novamente
        </button>
      </>
    )
  } else {
    const empty = folders.length === 0
    bodyContent = (
      <>
        {folderRef ? (
          <nav className={styles.crumbs} aria-label="Localização atual">
            <span className={styles.crumbSegment}>
              <button type="button" className={styles.crumb} onClick={() => setFolderRef(null)}>
                {provider.name}
              </button>
              {parents.length > 0 ? (
                <span className={styles.separator} aria-hidden="true">
                  /
                </span>
              ) : null}
            </span>
            {parents.map((item, index) => (
              <span key={item.ref} className={styles.crumbSegment}>
                <button type="button" className={styles.crumb} onClick={() => setFolderRef(item.ref)}>
                  {item.name}
                </button>
                {index < parents.length - 1 ? (
                  <span className={styles.separator} aria-hidden="true">
                    /
                  </span>
                ) : null}
              </span>
            ))}
          </nav>
        ) : null}

        {empty ? (
          <p className={styles.empty}>Esta pasta está vazia.</p>
        ) : (
          <div className={styles.grid}>
            {folders.map((item) => {
              const blocked = blockedRefs.includes(item.ref)
              return (
                <button
                  key={item.ref}
                  type="button"
                  className={styles.item}
                  disabled={blocked}
                  title={blocked ? blockedHint : undefined}
                  onClick={() => {
                    if (blocked) return
                    setFolderRef(item.ref)
                  }}
                >
                  <span className={styles.face} aria-hidden="true">
                    <span
                      className={styles.folderMark}
                      style={{ '--folder-mark': `url("${folderMark}")` }}
                    />
                  </span>
                  <span className={styles.meta}>
                    <span className={styles.itemTitle}>{item.name}</span>
                    <span className={styles.itemSub}>Pasta · {provider.name}</span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </>
    )
  }

  return {
    picking: true,
    stage: 'browse',
    atRoot: !folderRef,
    title: currentFolder?.name ?? provider.name,
    refreshKey: `${provider.id}-${folderRef ?? 'root'}`,
    trailing: (
      <button
        type="button"
        className={styles.choose}
        disabled={!canChoose || folderQuery.status === 'loading'}
        title={currentBlocked ? blockedHint : undefined}
        onClick={() => {
          if (!canChoose) return
          onChoose?.(chosenLocation)
        }}
      >
        Escolher
      </button>
    ),
    body: bodyContent,
  }
}
