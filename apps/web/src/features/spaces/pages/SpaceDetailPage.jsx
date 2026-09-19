import { Navigate, useParams } from 'react-router-dom'
import AppShell from '../../../shared/components/AppShell/AppShell.jsx'
import { ROUTES, spaceUrl } from '../../../shared/config/routes.js'
import {
  getSpace,
  locationPath,
  spaceStatus,
  statusBannerLabel,
} from '../../../shared/state/hubStore.js'
import { useHub } from '../../../shared/state/HubState.jsx'
import ProviderMark from '../components/ProviderMark.jsx'
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

  const status = spaceStatus(space)
  const conflicts = space.conflicts ?? []
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
          onRename={(name) => dispatch({ type: 'renameSpace', spaceId: space.space_id, name })}
          subtitle={space.lastSyncedAt ? `Última sinc ${space.lastSyncedAt}` : null}
        />
      }
    >
      <main className={styles.main}>
        <section className={styles.pair} aria-label="Par de sincronização">
          <Endpoint role="origin" label="Origem" location={space.origin} />
          <span className={styles.direction} aria-hidden="true">
            →
          </span>
          <Endpoint role="destination" label="Destino" location={space.destination} />
        </section>

        <p className={styles.banner} data-status={status}>
          {statusBannerLabel(status)}
        </p>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primary}
            onClick={() => dispatch({ type: 'syncNow', spaceId: space.space_id })}
          >
            Sincronizar
          </button>
          <button
            type="button"
            className={styles.secondary}
            onClick={() =>
              dispatch({
                type: 'pauseSpace',
                spaceId: space.space_id,
                paused: !space.paused,
              })
            }
          >
            {space.paused ? 'Retomar' : 'Pausar'}
          </button>
        </div>

        {conflicts.length > 0 ? (
          <section className={styles.conflicts} aria-label="Conflitos">
            {conflicts.map((conflict) => (
              <div key={conflict.id} className={styles.conflict}>
                <span className={styles.conflictName}>{conflict.fileName}</span>
                <span className={styles.conflictActions}>
                  <button
                    type="button"
                    className={styles.keep}
                    onClick={() =>
                      dispatch({
                        type: 'resolveConflict',
                        spaceId: space.space_id,
                        conflictId: conflict.id,
                        side: 'origin',
                      })
                    }
                  >
                    Manter origem
                  </button>
                  <button
                    type="button"
                    className={styles.keep}
                    onClick={() =>
                      dispatch({
                        type: 'resolveConflict',
                        spaceId: space.space_id,
                        conflictId: conflict.id,
                        side: 'destination',
                      })
                    }
                  >
                    Manter destino
                  </button>
                </span>
              </div>
            ))}
          </section>
        ) : null}

        <button
          type="button"
          className={styles.delete}
          onClick={() =>
            openOverlay({ type: 'confirm-delete-space', spaceId: space.space_id })
          }
        >
          Excluir space
        </button>
      </main>
    </AppShell>
  )
}

function Endpoint({ role, label, location }) {
  return (
    <div className={styles.endpoint} data-role={role}>
      <span className={styles.endpointLabel}>{label}</span>
      <span className={styles.endpointHead}>
        <ProviderMark id={location?.providerId} size={22} />
        <span className={styles.endpointProvider}>{location?.provider}</span>
      </span>
      <span className={styles.endpointPath}>{locationPath(location)}</span>
    </div>
  )
}
