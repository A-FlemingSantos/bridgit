import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import AppShell from '../../../shared/components/AppShell/AppShell.jsx'
import OverflowMenu from '../../../shared/components/OverflowMenu/OverflowMenu.jsx'
import { spaceUrl } from '../../../shared/config/routes.js'
import { spaceProvidersLabel } from '../../../shared/state/hubStore.js'
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
  const { state, dispatch, openOverlay } = useHub()
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
            <button type="button" className={styles.more} onClick={createSpace}>
              Novo
            </button>
          </header>

          {state.spaces.length === 0 ? (
            <p className={styles.empty}>
              Nenhum space. A sinc nasce aqui — nada é espelhado por padrão.
            </p>
          ) : (
            <div className={styles.grid}>
              {state.spaces.map((space, index) => (
                <motion.div
                  key={space.space_id}
                  className={styles.wrap}
                  variants={rise}
                  initial="hidden"
                  animate="show"
                  custom={0.06 + index * 0.05}
                >
                  <Link to={spaceUrl(space.slug)} className={styles.tile} aria-label={space.name}>
                    <span className={styles.face} aria-hidden="true">
                      <span className={styles.spaceName}>{space.name}</span>
                    </span>
                    <span className={styles.meta}>
                      <span className={styles.title}>{space.name}</span>
                      <span className={styles.sub}>{spaceProvidersLabel(state, space)}</span>
                    </span>
                  </Link>
                  <OverflowMenu
                    floating
                    hoverReveal
                    label={`Ações de ${space.name}`}
                    items={[
                      {
                        id: 'rename',
                        label: 'Renomear',
                        onSelect: () =>
                          openOverlay({ type: 'name', kind: 'space', spaceId: space.space_id }),
                      },
                      {
                        id: 'pause',
                        label: space.paused ? 'Retomar' : 'Pausar',
                        onSelect: () =>
                          dispatch({
                            type: 'pauseSpace',
                            spaceId: space.space_id,
                            paused: !space.paused,
                          }),
                      },
                      {
                        id: 'delete',
                        label: 'Excluir',
                        onSelect: () =>
                          openOverlay({
                            type: 'confirm-delete-space',
                            spaceId: space.space_id,
                          }),
                      },
                    ]}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </section>
      </main>
    </AppShell>
  )
}
