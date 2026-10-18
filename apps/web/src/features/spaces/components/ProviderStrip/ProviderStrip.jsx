import ProviderMark from '../ProviderMark.jsx'
import styles from './ProviderStrip.module.css'

function accountLabel(provider) {
  if (provider.lastError === 'RECONEXAO_NECESSARIA') return 'Acesso expirado'
  return provider.account?.email ?? provider.account?.name ?? ''
}

// The clouds side by side as cards, the mark over the name, for dialogs that ask where something
// goes. An expired connection is shown but cannot be picked until it is reconnected.
export default function ProviderStrip({ providers, onPick, label = 'Provedores' }) {
  if (providers.length === 0) {
    return <p className={styles.empty}>Nenhuma nuvem conectada.</p>
  }

  return (
    <div className={styles.strip} role="listbox" aria-label={label}>
      {providers.map((provider) => {
        const expired = provider.lastError === 'RECONEXAO_NECESSARIA'
        const account = accountLabel(provider)
        return (
          <button
            key={provider.id}
            type="button"
            role="option"
            aria-selected="false"
            aria-label={provider.name}
            className={styles.card}
            disabled={expired}
            onClick={() => onPick(provider.id)}
          >
            <ProviderMark id={provider.id} size={36} />
            <span className={styles.name}>{provider.name}</span>
            {account ? (
              <span className={styles.account} data-expired={expired || undefined}>
                {account}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
