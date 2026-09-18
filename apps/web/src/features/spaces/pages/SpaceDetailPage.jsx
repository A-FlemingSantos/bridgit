import { Navigate, useParams } from 'react-router-dom'
import { Pause, PenLine, Play, Trash2 } from 'lucide-react'
import AppShell from '../../../shared/components/AppShell/AppShell.jsx'
import OverflowMenu from '../../../shared/components/OverflowMenu/OverflowMenu.jsx'
import { ROUTES, spaceUrl } from '../../../shared/config/routes.js'
import {
  getSpace,
  getSpacePairs,
  locationLabel,
  statusLabel,
} from '../../../shared/state/hubStore.js'
import { useHub } from '../../../shared/state/HubState.jsx'
import ProviderMark from '../components/ProviderMark.jsx'
import SpaceViewActions from '../components/SpaceViewActions/SpaceViewActions.jsx'
import SpaceViewHeader from '../components/SpaceViewHeader/SpaceViewHeader.jsx'
import styles from './SpaceDetailPage.module.css'

export default function SpaceDetailPage() {
  const { spaceRef } = useParams()
  const { state, dispatch, openOverlay } = useHub()
  const space = getSpace(state, spaceRef)

  if (!space) {
    return <Navigate to={ROUTES.spaces} replace />
  }

  if (space.slug !== spaceRef) {
    return <Navigate to={spaceUrl(space.slug)} replace />
  }

  const pairs = getSpacePairs(state, space.space_id)
  const crumbs = [
    { label: 'Spaces', to: ROUTES.spaces },
    { label: space.name, current: true },
  ]

  return (
    <AppShell
      refreshKey={space.space_id}
      subheader={
        <SpaceViewHeader
          items={crumbs}
          trailing={
            <SpaceViewActions
              createLabel="Adicionar"
              onCreate={() =>
                openOverlay({ type: 'composer', mode: 'pair', spaceId: space.space_id })
              }
              extras={[
                {
                  id: 'pause',
                  label: space.paused ? 'Retomar' : 'Pausar',
                  icon: space.paused ? Play : Pause,
                  onSelect: () =>
                    dispatch({
                      type: 'pauseSpace',
                      spaceId: space.space_id,
                      paused: !space.paused,
                    }),
                },
                {
                  id: 'rename',
                  label: 'Renomear',
                  icon: PenLine,
                  onSelect: () =>
                    openOverlay({ type: 'name', kind: 'space', spaceId: space.space_id }),
                },
                {
                  id: 'delete',
                  label: 'Excluir',
                  icon: Trash2,
                  onSelect: () =>
                    openOverlay({ type: 'confirm-delete-space', spaceId: space.space_id }),
                },
              ]}
            />
          }
        />
      }
    >
      <main className={styles.main}>
        {pairs.length === 0 ? (
          <p className={styles.empty}>Este space ainda não espelha nada.</p>
        ) : (
          <section className={styles.section}>
            <div className={styles.list}>
              {pairs.map((pair) => (
                <div key={pair.pair_id} className={styles.row}>
                  <Side location={pair.left} />
                  <span className={styles.swap} aria-hidden="true">
                    /
                  </span>
                  <Side location={pair.right} />
                  <span className={styles.status}>{statusLabel(space.paused ? 'paused' : pair.status)}</span>
                  <OverflowMenu
                    ghost
                    label="Ações do espelho"
                    items={[
                      pair.status === 'conflict'
                        ? {
                            id: 'resolve',
                            label: 'Marcar sincronizado',
                            onSelect: () =>
                              dispatch({
                                type: 'setPairStatus',
                                pairId: pair.pair_id,
                                status: 'synced',
                              }),
                          }
                        : {
                            id: 'pause',
                            label: pair.status === 'paused' ? 'Retomar' : 'Pausar',
                            onSelect: () =>
                              dispatch({
                                type: 'setPairStatus',
                                pairId: pair.pair_id,
                                status: pair.status === 'paused' ? 'synced' : 'paused',
                              }),
                          },
                      {
                        id: 'remove',
                        label: 'Remover',
                        onSelect: () => dispatch({ type: 'removePair', pairId: pair.pair_id }),
                      },
                    ]}
                  />
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </AppShell>
  )
}

function Side({ location }) {
  return (
    <span className={styles.side}>
      <ProviderMark id={location.providerId} size={22} />
      <span className={styles.sideMeta}>
        <span className={styles.sideTitle}>{locationLabel(location)}</span>
        <span className={styles.sideSub}>
          {location.kind === 'file' ? 'Arquivo' : 'Pasta'} · {location.provider}
        </span>
      </span>
    </span>
  )
}
