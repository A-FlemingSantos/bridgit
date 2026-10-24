import { accountLabel } from '../../connectionLabel.js'
import ProviderMark from '../ProviderMark.jsx'
import styles from './ProviderStrip.module.css'

function accountLine(entry) {
  if (entry.lastError === 'RECONEXAO_NECESSARIA') return 'Acesso expirado'
  return accountLabel(entry.account)
}

// The clouds side by side as cards, the mark over the name, for dialogs that ask where something
// goes. Each card is an account: `providers` holds connections ({ connectionId, provider, providerName,
// account }), and `onPick` gets the connectionId. (The mock catalog's plain { id, name } providers still
// work, picked by id.) An expired connection is shown but cannot be picked until it is reconnected.
export default function ProviderStrip({ providers, onPick, label = 'Provedores' }) {
  if (providers.length === 0) {
    return <p className={styles.empty}>Nenhuma nuvem conectada.</p>
  }

  return (
    <div className={styles.strip} role="listbox" aria-label={label}>
      {providers.map((entry) => {
        const key = entry.connectionId ?? entry.id
        const kind = entry.provider ?? entry.id
        const name = entry.providerName ?? entry.name
        const expired = entry.lastError === 'RECONEXAO_NECESSARIA'
        const account = accountLine(entry)
        // Accounts of one provider share its name, so the account is what tells them apart.
        const shared = providers.filter((other) => (other.provider ?? other.id) === kind).length > 1
        const accessibleName = shared && accountLabel(entry.account) ? `${name} ${accountLabel(entry.account)}` : name
        return (
          <button
            key={key}
            type="button"
            role="option"
            aria-selected="false"
            aria-label={accessibleName}
            className={styles.card}
            disabled={expired}
            onClick={() => onPick(key)}
          >
            <ProviderMark id={kind} size={36} />
            <span className={styles.name}>{name}</span>
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
