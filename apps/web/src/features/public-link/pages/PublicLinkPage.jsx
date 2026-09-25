import { ApiClientError, apiRequest } from '@bridgit/shared-client'
import { Download } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import FileReader from '../../../shared/components/FileReader/FileReader.jsx'
import { ROUTES } from '../../../shared/config/routes.js'
import { formatFileSize } from '../formatFileSize.js'
import { parseLinkSuffix } from '../parseLinkSuffix.js'
import styles from './PublicLinkPage.module.css'

const DEFAULT_TITLE = 'Bridgit'

export default function PublicLinkPage() {
  const { linkRef } = useParams()
  const suffix = useMemo(() => parseLinkSuffix(linkRef), [linkRef])
  const [meta, setMeta] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

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
        setMeta(data)
      } catch (err) {
        if (cancelled) return

        if (err instanceof ApiClientError && err.code === 'LINK_NAO_ENCONTRADO') {
          setError('Link indisponível')
        } else if (err instanceof ApiClientError) {
          setError(err.message)
        } else {
          setError('Não foi possível carregar este link.')
        }
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
      setError('Link indisponível')
    }

    return () => {
      cancelled = true
    }
  }, [suffix])

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
            <h1 className={styles.stateTitle}>Link indisponível</h1>
            <p className={styles.stateCopy}>{error}</p>
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
              />
            </div>
          </>
        ) : null}
      </main>
    </div>
  )
}
