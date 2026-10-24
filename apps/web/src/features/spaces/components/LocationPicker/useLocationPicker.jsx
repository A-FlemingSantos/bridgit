import { useEffect, useMemo, useState } from 'react'
import ProviderStrip from '../ProviderStrip/ProviderStrip.jsx'
import FileSheet from '../FileSheet/FileSheet.jsx'
import FolderArt from '../FolderArt/FolderArt.jsx'
import { FolderTrail, folderViewStyles, ItemGrid, TileContent } from '../FolderView/FolderView.jsx'
import { connectionLabel } from '../../connectionLabel.js'
import { useFolderColors } from '../../folderColors.js'
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
import { useConnections, useFolder } from '../../../../shared/hub/index.js'
import { overlayStyles as styles } from '../../../../shared/components/AppOverlay/AppOverlay.jsx'

// Where to pick a folder. `source: 'api'` browses a connected account (`initialConnectionId`); `source: 'mock'`
// browses the Spaces catalog, where a provider stands in for its one account.
export function useLocationPicker({
  source = 'mock',
  excludeConnectionId,
  disabledFolderRef = null,
  disabledFolderRefs = [],
  initialConnectionId = null,
  foldersOnly = false,
  allowRoot = false,
  blockedHint = 'Esta pasta já é o outro lado',
  onChoose,
  resetKey,
} = {}) {
  // `source` is fixed for each place that opens a picker, so the same hook runs on every render.
  if (source === 'api') {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useApiLocationPicker({
      disabledFolderRef,
      disabledFolderRefs,
      initialConnectionId,
      allowRoot,
      blockedHint,
      onChoose,
      resetKey,
    })
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useMockLocationPicker({
    excludeConnectionId,
    disabledFolderRef,
    disabledFolderRefs,
    initialConnectionId,
    foldersOnly,
    allowRoot,
    blockedHint,
    onChoose,
    resetKey,
  })
}

function useMockLocationPicker({
  excludeConnectionId,
  disabledFolderRef = null,
  disabledFolderRefs = [],
  initialConnectionId = null,
  foldersOnly = false,
  allowRoot = false,
  blockedHint = 'Esta pasta já é o outro lado',
  onChoose,
  resetKey,
} = {}) {
  const { state } = useHub()
  const [providerId, setProviderId] = useState(initialConnectionId)
  const [folderRef, setFolderRef] = useState(null)

  useEffect(() => {
    setProviderId(initialConnectionId)
    setFolderRef(null)
  }, [resetKey, excludeConnectionId, initialConnectionId])

  const provider = providerId ? getProvider(state, providerId) : null
  const folder = folderRef ? getFolder(state, folderRef) : null
  const contents = provider
    ? folderRef
      ? getFolderContents(state, folderRef)
      : getProviderContents(state, provider.id)
    : { folders: [], files: [] }

  const providers = state.providers.filter((item) => item.id !== excludeConnectionId)
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
        <ProviderStrip
          providers={providers}
          onPick={(id) => {
            setProviderId(id)
            setFolderRef(null)
          }}
        />
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
          <FolderTrail
            size="compact"
            ancestors={[
              { label: provider.name, onSelect: () => setFolderRef(null) },
              ...parents.map((item) => ({ label: item.name, onSelect: () => setFolderRef(item.folderRef) })),
            ]}
            current={folder.name}
          />
        ) : initialConnectionId ? null : (
          <button type="button" className={styles.more} onClick={() => setProviderId(null)}>
            Provedores
          </button>
        )}

        {empty ? (
          <p className={styles.empty}>Esta pasta está vazia.</p>
        ) : (
          <>
            {contents.folders.length > 0 ? (
              <ItemGrid label="Pastas" fill tileWidth="132px">
                {contents.folders.map((item) => {
                  const blocked = blockedRefs.includes(item.folderRef)
                  return (
                    <button
                      key={item.folderRef}
                      type="button"
                      className={folderViewStyles.tile}
                      disabled={blocked}
                      title={blocked ? blockedHint : undefined}
                      onClick={() => {
                        if (blocked) return
                        setFolderRef(item.folderRef)
                      }}
                    >
                      <TileContent art={<FolderArt size="small" />} title={item.name} subtitle={`Pasta · ${item.provider}`} />
                    </button>
                  )
                })}
              </ItemGrid>
            ) : null}
            {!foldersOnly && contents.files.length > 0 ? (
              <ItemGrid label="Arquivos" fill tileWidth="132px">
                {contents.files.map((item) => (
                  <button
                    key={item.fileRef}
                    type="button"
                    className={folderViewStyles.tile}
                    onClick={() =>
                      onChoose?.(
                        item.folderRef ? makeFolderLocationFromState(state, item.folderRef) : null,
                      )
                    }
                  >
                    <TileContent art={<FileSheet />} title={item.title} subtitle={`${item.kind} · ${item.provider}`} />
                  </button>
                ))}
              </ItemGrid>
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
  initialConnectionId = null,
  allowRoot = false,
  blockedHint = 'Não dá para mover para cá',
  onChoose,
  resetKey,
} = {}) {
  const { connections } = useConnections()
  const folderColors = useFolderColors()
  const [destination, setDestination] = useState(null)
  const [continuationError, setContinuationError] = useState(null)
  const connectionId = initialConnectionId
  const connection = connections.find((item) => item.connectionId === connectionId) ?? null
  const accountName = connectionLabel(connection, connections)
  const folderRef = destination?.ref ?? null
  const folderQuery = useFolder(connectionId, folderRef)

  useEffect(() => {
    setDestination(null)
    setContinuationError(null)
  }, [resetKey, initialConnectionId])

  const blockedRefs = [disabledFolderRef, ...disabledFolderRefs].filter(Boolean)
  const folders = folderQuery.items.filter((item) => item.kind === 'folder')
  const hasMore = folderQuery.hasMore ?? Boolean(folderQuery.nextCursor)
  const [loadingMore, setLoadingMore] = useState(false)
  const isFetchingNextPage = folderQuery.isFetchingNextPage ?? loadingMore
  const parents = folderRef ? (folderQuery.folder?.ancestry ?? []) : []
  const exhausted = !hasMore && !isFetchingNextPage
  const queryError = folderQuery.error ?? null
  const paginationError =
    continuationError ?? (folderQuery.status === 'ready' ? queryError : null)

  async function handleLoadMore() {
    if (loadingMore || folderQuery.isFetchingNextPage || !hasMore) return
    setContinuationError(null)
    setLoadingMore(true)
    try {
      await folderQuery.loadMore?.()
    } catch (error) {
      setContinuationError(error)
    } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    if (folderQuery.status !== 'ready') return
    if (queryError) return
    if (folders.length > 0 || continuationError) return
    if (!hasMore || isFetchingNextPage) return
    void handleLoadMore()
  })

  function goTo(ref, name) {
    setDestination({ ref, name })
    setContinuationError(null)
  }

  function goRoot() {
    setDestination(null)
    setContinuationError(null)
  }

  if (!connection) {
    return {
      picking: true,
      stage: 'providers',
      atRoot: true,
      title: 'Provedor',
      trailing: null,
      refreshKey: 'providers',
      validated: false,
      chosenLocation: null,
      body: <p className={styles.empty}>Provedor indisponível.</p>,
    }
  }

  const atRoot = destination === null
  const subfolderValidated =
    !atRoot && folderQuery.status === 'ready' && folderQuery.folder?.ref === folderRef
  const validated = atRoot ? true : subfolderValidated
  const currentBlocked = Boolean(!atRoot && blockedRefs.includes(folderRef))
  const canChoose = validated && (atRoot ? allowRoot : !currentBlocked)

  const chosenLocation = !validated
    ? null
    : atRoot
      ? { ...makeRootLocation({ id: connection.provider, name: connection.providerName }), connectionId }
      : {
          kind: 'folder',
          ref: folderRef,
          name: destination?.name ?? folderQuery.folder?.name ?? '',
          connectionId,
          providerId: connection.provider,
          provider: connection.providerName,
        }

  const chooseDisabled = !canChoose || (!atRoot && folderQuery.status !== 'ready')

  let bodyContent = null

  if (folderQuery.status === 'loading' || folderQuery.status === 'idle') {
    bodyContent = <p className={styles.empty}>Carregando…</p>
  } else if (folderQuery.status === 'error' && folders.length === 0) {
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
    const showEmpty = folders.length === 0 && exhausted
    bodyContent = (
      <>
        {/* Where the item goes, like the folder pages: the cloud, the folders above, then this one. */}
        <FolderTrail
          size="compact"
          ancestors={folderRef
            ? [
                { label: accountName, onSelect: goRoot },
                ...parents.map((item) => ({ label: item.name, onSelect: () => goTo(item.ref, item.name) })),
              ]
            : []}
          current={folderRef ? (destination?.name ?? folderQuery.folder?.name ?? '') : accountName}
        />

        {folderQuery.status === 'error' ? (
          <p className={styles.hint} role="alert">
            Não foi possível carregar tudo. Mostrando o que já carregou.
          </p>
        ) : null}
        {paginationError ? (
          <p className={styles.hint} role="alert">
            Não foi possível carregar mais pastas.
          </p>
        ) : null}

        {showEmpty ? (
          <p className={styles.empty}>Esta pasta está vazia.</p>
        ) : (
          <ItemGrid label="Pastas" fill>
            {folders.map((item) => {
              const blocked = blockedRefs.includes(item.ref)
              return (
                <button
                  key={item.ref}
                  type="button"
                  className={folderViewStyles.tile}
                  disabled={blocked}
                  title={blocked ? blockedHint : undefined}
                  onClick={() => {
                    if (blocked) return
                    goTo(item.ref, item.name)
                  }}
                >
                  <TileContent
                    art={<FolderArt color={folderColors.colorOf(connectionId, item.ref).hex} />}
                    title={item.name}
                    subtitle="Pasta"
                  />
                </button>
              )
            })}
          </ItemGrid>
        )}

        {hasMore ? (
          <button
            type="button"
            className={styles.more}
            disabled={isFetchingNextPage}
            onClick={() => void handleLoadMore()}
          >
            {isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
          </button>
        ) : null}
        {(folderQuery.status === 'error' && folders.length > 0) || paginationError ? (
          <button type="button" className={styles.more} onClick={() => void handleLoadMore()}>
            Tentar novamente
          </button>
        ) : null}
      </>
    )
  }

  return {
    picking: true,
    stage: 'browse',
    atRoot: !folderRef,
    title: atRoot ? accountName : (destination?.name ?? folderQuery.folder?.name ?? accountName),
    refreshKey: `${connectionId}-${folderRef ?? 'root'}`,
    validated,
    chosenLocation,
    chooseDisabled,
    blockedReason: currentBlocked ? blockedHint : null,
    choose: () => {
      if (chooseDisabled) return
      onChoose?.(chosenLocation)
    },
    trailing: (
      <button
        type="button"
        className={styles.choose}
        disabled={chooseDisabled}
        title={currentBlocked ? blockedHint : undefined}
        onClick={() => {
          if (chooseDisabled) return
          onChoose?.(chosenLocation)
        }}
      >
        Escolher
      </button>
    ),
    body: bodyContent,
  }
}
