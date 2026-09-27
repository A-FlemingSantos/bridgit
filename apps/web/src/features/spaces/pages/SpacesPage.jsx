import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import AppShell from '../../../shared/components/AppShell/AppShell.jsx'
import StaggerItem from '../../../shared/components/motion/StaggerItem.jsx'
import { spaceUrl } from '../../../shared/config/routes.js'
import { spaceStatus, spaceSummary, statusLabel } from '../../../shared/state/hubStore.js'
import { useHub } from '../../../shared/state/HubState.jsx'
import styles from './SpacesPage.module.css'

const rise = {
  hidden: { opacity: 0, y: 10 },
  show: (delay) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] },
  }),
}

export default function SpacesPage() {
  const { state, openOverlay } = useHub()
  const [params, setParams] = useSearchParams()

  useEffect(() => {
    if (params.get('novo') !== '1') return
    openOverlay({ type: 'composer', mode: 'create' })
    const next = new URLSearchParams(params)
    next.delete('novo')
    setParams(next, { replace: true })
  }, [params, setParams, openOverlay])

  function createSpace() {
    openOverlay({ type: 'composer', mode: 'create' })
  }

  return (
    <AppShell refreshKey="spaces">
      <main className={styles.main}>
        <section className={styles.section}>
          <header className={styles.sectionHead}>
            <h1>Spaces</h1>
          </header>

          {state.spaces.length === 0 ? (
            <p className={styles.empty}>
              Nenhum space. A sinc nasce aqui — nada é espelhado por padrão.
            </p>
          ) : null}

          <div className={styles.grid}>
            {state.spaces.map((space, index) => {
              const status = spaceStatus(space)
              return (
                <StaggerItem
                  key={space.space_id}
                  index={index}
                  base={0.06}
                  step={0.05}
                  variants={rise}
                  className={styles.wrap}
                >
                  <Link to={spaceUrl(space.slug)} className={styles.tile} aria-label={space.name}>
                    <span className={styles.face} aria-hidden="true">
                      <span className={styles.spaceName}>{space.name}</span>
                    </span>
                    <span className={styles.meta}>
                      <span className={styles.title}>{space.name}</span>
                      <span className={styles.sub}>{spaceSummary(space)}</span>
                      <span className={styles.status}>{statusLabel(status)}</span>
                    </span>
                  </Link>
                </StaggerItem>
              )
            })}

            <StaggerItem
              index={state.spaces.length}
              base={0.06}
              step={0.05}
              variants={rise}
              className={styles.wrap}
            >
              <button type="button" className={styles.add} onClick={createSpace} aria-label="Novo space">
                <span className={styles.face} aria-hidden="true">
                  <Plus size={22} strokeWidth={1.5} />
                </span>
                <span className={styles.meta}>
                  <span className={styles.title}>Novo space</span>
                  <span className={styles.sub}>Origem e destino</span>
                </span>
              </button>
            </StaggerItem>
          </div>
        </section>
      </main>
    </AppShell>
  )
}
