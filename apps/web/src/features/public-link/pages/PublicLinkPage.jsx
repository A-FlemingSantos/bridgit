import { ApiClientError, apiRequest } from '@bridgit/shared-client'
import { Download } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import FileReader from '../../../shared/components/FileReader/FileReader.jsx'
import { resolveApiUrl } from '../../../shared/config/apiBase.js'
import { ROUTES } from '../../../shared/config/routes.js'
import { formatFileSize } from '../formatFileSize.js'
import { parseLinkSuffix } from '../parseLinkSuffix.js'
import styles from './PublicLinkPage.module.css'

const DEFAULT_TITLE = 'Bridgit'

const UNAVAILABLE_STATE = { title: 'Link indisponível', message: 'Link indisponível', canRetry: false }

function errorState(err) {
  if (err instanceof ApiClientError) {
    if (err.code === 'LINK_NAO_ENCONTRADO') return UNAVAILABLE_STATE
    if (err.code === 'LINK_INDISPONIVEL') {
      return {
        title: 'Arquivo temporariamente indisponível',
        message: 'O arquivo não está disponível agora. Tente de novo em instantes.',
        canRetry: true,
      }
    }
    if (err.code === 'MUITOS_ACESSOS') {
      return {
        title: 'Muitos acessos',
        message: 'Muitos acessos a este link. Tente de novo em instantes.',
        canRetry: true,
      }
    }
    return { title: 'Link indisponível', message: err.message, canRetry: false }
  }
  return {
    title: 'Link indisponível',
    message: 'Não foi possível carregar este link.',
    canRetry: false,
  }
}

export default function PublicLinkPage() {
  const { linkRef } = useParams()
  const suffix = useMemo(() => parseLinkSuffix(linkRef), [linkRef])
  const [meta, setMeta] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    const tag = document.createElement('meta')
    tag.name = 'robots'
    tag.content = 'noindex, nofollow'
    document.head.appendChild(tag)

    return () => {
      tag.remove()
    }
  }, [])

  useEffect(() => {
    document.title = meta?.name ?? DEFAULT_TITLE

    return () => {
      document.title = DEFAULT_TITLE
    }
  }, [meta?.name])

  useEffect(() => {
    let cancelled = false

    async function loadLink() {
      setLoading(true)
      setError(null)
      setMeta(null)

      try {
        const data = await apiRequest(`/api/public/links/${suffix}`)
        if (cancelled) return
        setMeta({
          ...data,
          contentUrl: resolveApiUrl(data?.contentUrl),
          readUrl: resolveApiUrl(data?.readUrl),
        })
      } catch (err) {
        if (cancelled) return

        setError(errorState(err))
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    if (suffix) {
      loadLink()
    } else {
      setLoading(false)
      setError(UNAVAILABLE_STATE)
    }

    return () => {
      cancelled = true
    }
  }, [suffix, reloadTick])

  const file = meta
    ? {
        name: meta.name,
        extension: meta.extension,
        mimeType: meta.mimeType,
        providerName: meta.providerName,
      }
    : null

  const source =
    meta && !error
      ? {
          mode: meta.mode,
          url: meta.readUrl,
        }
      : null

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to={ROUTES.landing} className={styles.brand}>
          Bridgit
        </Link>
      </header>

      <main className={styles.main}>
        {loading ? (
          <div className={styles.readerWrap}>
            <FileReader
              file={{ name: 'Carregando...' }}
              source={null}
              error={null}
              downloadUrl={null}
            />
          </div>
        ) : null}

        {!loading && error ? (
          <div className={styles.state} role="alert">
            <h1 className={styles.stateTitle}>{error.title}</h1>
            <p className={styles.stateCopy}>{error.message}</p>
            {error.canRetry ? (
              <button
                type="button"
                className={styles.download}
                onClick={() => setReloadTick((tick) => tick + 1)}
              >
                Tentar de novo
              </button>
            ) : null}
          </div>
        ) : null}

        {!loading && meta ? (
          <>
            <div className={styles.intro}>
              <h1 className={styles.fileName}>{meta.name}</h1>
              <p className={styles.fileMeta}>{formatFileSize(meta.size)}</p>
              <a
                className={styles.download}
                href={meta.contentUrl}
                download
              >
                <Download size={15} aria-hidden="true" />
                Baixar
              </a>
            </div>

            <div className={styles.readerWrap}>
              <FileReader
                file={file}
                source={source}
                error={null}
                downloadUrl={meta.contentUrl}
                onRetry={() => setReloadTick((tick) => tick + 1)}
              />
            </div>
          </>
        ) : null}
      </main>
    </div>
  )
}
