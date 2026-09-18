import { Link } from 'react-router-dom'
import Toggle from '../components/Toggle.jsx'
import { spaceUrl } from '../../../shared/config/routes.js'
import {
  getSpacePairs,
  spaceProvidersLabel,
  spaceStatus,
  statusLabel,
} from '../../../shared/state/hubStore.js'
import { useHub } from '../../../shared/state/HubState.jsx'
import styles from './SettingsPage.module.css'

export default function SyncTab() {
  const { state, dispatch } = useHub()

  return (
    <section className={styles.pane}>
      <h1>Sincronização</h1>
      <p className={styles.lead}>
        Nada é espelhado por padrão. O hub só orquestra o que você ligar — a cópia continua no
        provedor. A sinc nasce e vive num space.
      </p>

      <div className={styles.cards}>
        <div className={styles.pref}>
          <span>
            <span className={styles.prefTitle}>Avisar se a sincronização falhar</span>
            <span className={styles.hint}>Só para os itens que você marcou.</span>
          </span>
          <Toggle
            label="Avisar se a sincronização falhar"
            checked={state.notifyFail}
            onChange={(value) => dispatch({ type: 'setNotifyFail', value })}
          />
        </div>
      </div>

      <h2>Spaces</h2>
      {state.spaces.length === 0 ? (
        <p className={styles.hint}>Nenhum space ainda.</p>
      ) : (
        <div className={styles.cards}>
          {state.spaces.map((space) => {
            const pairs = getSpacePairs(state, space.space_id)
            const status = spaceStatus(space, pairs)
            return (
              <div key={space.space_id} className={styles.pref}>
                <span>
                  <Link to={spaceUrl(space.slug)} className={styles.prefTitle}>
                    {space.name}
                  </Link>
                  <span className={styles.hint}>
                    {statusLabel(status)}
                    {status === 'synced' ? ` · ${spaceProvidersLabel(state, space)}` : ''}
                  </span>
                </span>
                <Toggle
                  label={space.paused ? `Retomar ${space.name}` : `Pausar ${space.name}`}
                  checked={!space.paused}
                  onChange={(value) =>
                    dispatch({ type: 'pauseSpace', spaceId: space.space_id, paused: !value })
                  }
                />
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
