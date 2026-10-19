import {
  ApiClientError,
  getPublicLinkItem,
  listPublicLinkFolder,
} from '@bridgit/shared-client'
import { Download } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import FileReader from '../../../shared/components/FileReader/FileReader.jsx'
import { resolveApiUrl } from '../../../shared/config/apiBase.js'
import { formatFileSize } from '../../../shared/utils/formatFileSize.js'
import FileSheet from '../../spaces/components/FileSheet/FileSheet.jsx'
import FolderArt from '../../spaces/components/FolderArt/FolderArt.jsx'
import {
  FolderTrail,
  folderViewStyles,
  ItemGrid,
  TileContent,
} from '../../spaces/components/FolderView/FolderView.jsx'
import { formatItemDate } from '../../spaces/formatItemDate.js'
import styles from './PublicFolderBrowser.module.css'

// Open pixel folder drawn in the empty-folder state (same drawing as the owner's folder page).
const FOLDER_OPEN = 'M3 4h8v2H3zM1 6h2v12H1zM9 6h10v2H9zM19 8h2v2h-2zM7 10h15v2H7zM5 12h2v2H5zM20 12h2v2h-2zM3 14h2v2H3zM18 14h2v2h-2zM16 16h2v2h-2z'
  + 'M3 18h13v2H3z'

const LOADING_LISTING = { status: 'loading' }

// Maps a failed request to what the page shows. `missing` is a child that is gone or outside the
// shared folder; the rest can be retried or only reported.
function describeError(err) {
  if (err instanceof ApiClientError) {
    if (err.code === 'LINK_ITEM_NAO_ENCONTRADO') return { kind: 'missing' }
    if (err.code === 'MUITOS_ACESSOS') {
      return {
        kind: 'retry',
        message: 'Muitos acessos a este link. Tente de novo em instantes.',
      }
    }
    if (err.code === 'LINK_INDISPONIVEL') {
      return {
        kind: 'retry',
        message: 'O conteúdo não está disponível agora. Tente de novo em instantes.',
      }
    }
    return { kind: 'error', message: err.message }
  }
  return { kind: 'error', message: 'Não foi possível carregar este conteúdo.' }
}

function isLinkGone(err) {
  return err instanceof ApiClientError && err.code === 'LINK_NAO_ENCONTRADO'
}

function itemKindLabel(item) {
  if (item.extension) return item.extension.toUpperCase()
  if (item.mimeType) return item.mimeType.split('/').pop()?.toUpperCase() ?? 'Arquivo'
  return 'Arquivo'
}

function ItemUnavailable({ rootHref }) {
  return (
    <div className={styles.state} role="alert">
      <h1 className={styles.stateTitle}>Item indisponível</h1>
      <p className={styles.stateCopy}>
        Este item não existe mais ou não faz parte do que foi compartilhado.
      </p>
      <Link to={rootHref} className={styles.download}>
        Ir para a pasta compartilhada
      </Link>
    </div>
  )
}

function RetryState({ message, onRetry }) {
  return (
    <div className={styles.state} role="alert">
      <p className={styles.stateCopy}>{message}</p>
      {onRetry ? (
        <button type="button" className={styles.download} onClick={onRetry}>
          Tentar de novo
        </button>
      ) : null}
    </div>
  )
}

function PublicFileView({ linkRef, itemRef, backHref, rootHref, onLinkGone }) {
  const [state, setState] = useState({ status: 'loading' })
  const [reloadTick, setReloadTick] = useState(0)
  const onLinkGoneRef = useRef(onLinkGone)
  onLinkGoneRef.current = onLinkGone

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })

    getPublicLinkItem(linkRef, itemRef)
      .then((data) => {
        if (cancelled) return
        if (data?.kind !== 'file') {
          setState({ status: 'error', error: { kind: 'missing' } })
          return
        }
        setState({
          status: 'ready',
          item: {
            ...data,
            contentUrl: resolveApiUrl(data.contentUrl),
            readUrl: resolveApiUrl(data.readUrl),
          },
        })
      })
      .catch((err) => {
        if (cancelled) return
        if (isLinkGone(err)) {
          onLinkGoneRef.current?.()
          return
        }
        setState({ status: 'error', error: describeError(err) })
      })

    return () => {
      cancelled = true
    }
  }, [linkRef, itemRef, reloadTick])

  if (state.status === 'loading') {
    return (
      <div className={styles.readerWrap}>
        <FileReader file={{ name: 'Carregando...' }} source={null} error={null} downloadUrl={null} />
      </div>
    )
  }

  if (state.status === 'error') {
    if (state.error.kind === 'missing') return <ItemUnavailable rootHref={rootHref} />
    return (
      <RetryState
        message={state.error.message}
        onRetry={state.error.kind === 'retry' ? () => setReloadTick((tick) => tick + 1) : null}
      />
    )
  }

  const { item } = state
  const file = {
    name: item.name,
    extension: item.extension,
    mimeType: item.mimeType,
    providerName: item.providerName,
  }

  return (
    <>
      <div className={styles.intro}>
        <h1 className={styles.fileName}>{item.name}</h1>
        <p className={styles.fileMeta}>{formatFileSize(item.size)}</p>
        <div className={styles.actions}>
          <a className={styles.download} href={item.contentUrl} download>
            <Download size={15} aria-hidden="true" />
            Baixar
          </a>
          <Link to={backHref} className={styles.back}>
            Voltar para a pasta
          </Link>
        </div>
      </div>

      <div className={styles.readerWrap}>
        <FileReader
          file={file}
          source={{ mode: item.mode, url: item.readUrl }}
          error={null}
          downloadUrl={item.contentUrl}
          onRetry={() => setReloadTick((tick) => tick + 1)}
        />
      </div>
    </>
  )
}

function FolderTile({ item, to }) {
  if (item.kind === 'folder') {
    return (
      <div className={folderViewStyles.wrap}>
        <Link to={to} className={folderViewStyles.tile}>
          <TileContent
            art={<FolderArt />}
            title={item.name}
            subtitle={formatItemDate(item.modifiedAt) || 'Pasta'}
          />
        </Link>
      </div>
    )
  }

  const details = [formatFileSize(item.size), formatItemDate(item.modifiedAt)].filter(Boolean).join(' · ')
  return (
    <div className={folderViewStyles.wrap}>
      <Link to={to} className={folderViewStyles.tile}>
        <TileContent
          art={<FileSheet file={item} />}
          title={item.name}
          subtitle={details || itemKindLabel(item)}
        />
      </Link>
    </div>
  )
}

// Read-only browser for a public folder link. The location lives in the query string
// (?pasta=<ref> for a subfolder, ?arquivo=<ref> for an open file) so back/forward just work.
export default function PublicFolderBrowser({ linkRef, meta, onLinkGone }) {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const folderRef = searchParams.get('pasta') || null
  const fileRef = searchParams.get('arquivo') || null

  const [listing, setListing] = useState(LOADING_LISTING)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState(null)
  const [reloadTick, setReloadTick] = useState(0)
  const generation = useRef(0)
  const onLinkGoneRef = useRef(onLinkGone)
  onLinkGoneRef.current = onLinkGone

  function hrefFor({ pasta = null, arquivo = null } = {}) {
    const params = new URLSearchParams()
    if (pasta) params.set('pasta', pasta)
    if (arquivo) params.set('arquivo', arquivo)
    const query = params.toString()
    return query ? `${location.pathname}?${query}` : location.pathname
  }

  const showingFile = fileRef !== null

  useEffect(() => {
    if (showingFile) return undefined

    generation.current += 1
    const current = generation.current
    setListing(LOADING_LISTING)
    setLoadingMore(false)
    setMoreError(null)

    listPublicLinkFolder(linkRef, { folder: folderRef })
      .then((data) => {
        if (current !== generation.current) return
        setListing({
          status: 'ready',
          folder: data?.folder ?? null,
          path: Array.isArray(data?.path) ? data.path : [],
          items: Array.isArray(data?.items) ? data.items : [],
          nextCursor: data?.nextCursor ?? null,
        })
      })
      .catch((err) => {
        if (current !== generation.current) return
        if (isLinkGone(err)) {
          onLinkGoneRef.current?.()
          return
        }
        setListing({ status: 'error', error: describeError(err) })
      })

    return () => {
      generation.current += 1
    }
  }, [linkRef, folderRef, showingFile, reloadTick])

  async function loadMore() {
    if (loadingMore || listing.status !== 'ready' || !listing.nextCursor) return
    const current = generation.current
    setLoadingMore(true)
    setMoreError(null)

    try {
      const data = await listPublicLinkFolder(linkRef, {
        folder: folderRef,
        cursor: listing.nextCursor,
      })
      if (current !== generation.current) return
      setListing((prev) => ({
        ...prev,
        items: [...prev.items, ...(Array.isArray(data?.items) ? data.items : [])],
        nextCursor: data?.nextCursor ?? null,
      }))
    } catch (err) {
      if (current !== generation.current) return
      if (isLinkGone(err)) {
        onLinkGoneRef.current?.()
        return
      }
      if (err instanceof ApiClientError && err.code === 'PASTA_ALTERADA') {
        // The folder changed under the cursor: start over from the first page.
        setReloadTick((tick) => tick + 1)
        return
      }
      setMoreError(describeError(err))
    } finally {
      if (current === generation.current) setLoadingMore(false)
    }
  }

  const rootHref = hrefFor()

  if (showingFile) {
    return (
      <div className={styles.browser}>
        <PublicFileView
          linkRef={linkRef}
          itemRef={fileRef}
          backHref={hrefFor({ pasta: folderRef })}
          rootHref={rootHref}
          onLinkGone={onLinkGone}
        />
      </div>
    )
  }

  function renderBody() {
    if (listing.status === 'loading') {
      return <p className={styles.empty}>Carregando…</p>
    }

    if (listing.status === 'error') {
      if (listing.error.kind === 'missing') return <ItemUnavailable rootHref={rootHref} />
      return (
        <RetryState
          message={listing.error.message}
          onRetry={() => setReloadTick((tick) => tick + 1)}
        />
      )
    }

    const folders = listing.items.filter((item) => item.kind === 'folder')
    const files = listing.items.filter((item) => item.kind !== 'folder')
    const empty = folders.length === 0 && files.length === 0

    const ancestors = listing.path.map((crumb) => ({
      label: crumb.ref == null ? meta.name : crumb.name,
      to: hrefFor({ pasta: crumb.ref }),
    }))
    if (folderRef && ancestors.length === 0) {
      ancestors.unshift({ label: meta.name, to: rootHref })
    }
    const currentName = folderRef ? (listing.folder?.name ?? '') : meta.name

    return (
      <>
        <FolderTrail ancestors={ancestors} current={currentName} currentAs="h1" />

        {empty ? (
          <div className={styles.emptyState}>
            <svg
              className={styles.emptyIcon}
              viewBox="0 0 24 24"
              fill="currentColor"
              shapeRendering="crispEdges"
              aria-hidden="true"
            >
              <path d={FOLDER_OPEN} />
            </svg>
            <p className={styles.emptyTitle}>Pasta vazia</p>
          </div>
        ) : null}

        {folders.length > 0 ? (
          <ItemGrid label="Pastas">
            {folders.map((item) => (
              <FolderTile key={item.ref} item={item} to={hrefFor({ pasta: item.ref })} />
            ))}
          </ItemGrid>
        ) : null}

        {files.length > 0 ? (
          <ItemGrid label="Arquivos">
            {files.map((item) => (
              <FolderTile
                key={item.ref}
                item={item}
                to={hrefFor({ pasta: folderRef, arquivo: item.ref })}
              />
            ))}
          </ItemGrid>
        ) : null}

        {moreError ? (
          <p className={styles.empty} role="alert">
            {moreError.kind === 'missing' ? 'Item indisponível.' : moreError.message}
          </p>
        ) : null}

        {listing.nextCursor ? (
          <button
            type="button"
            className={styles.loadMore}
            onClick={() => void loadMore()}
            disabled={loadingMore}
          >
            Carregar mais
          </button>
        ) : null}
      </>
    )
  }

  return <div className={styles.browser}>{renderBody()}</div>
}
