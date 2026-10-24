import AnchoredMenu from './AnchoredMenu'
import ProviderMark from './ProviderMark'

// Provider mark in the { size } icon shape the menu rows render.
const icons = new Map()

function markFor(id) {
  if (!icons.has(id)) {
    icons.set(id, function ProviderIcon({ size = 20 }) {
      return <ProviderMark id={id} size={size} />
    })
  }
  return icons.get(id)
}

// "Nova conta": the providers that can take another account, in a small menu that drops from `anchor`.
// providers: server provider rows ({ id, name, configured }); onSelect(providerId).
export default function AddAccountMenu({ open, anchor, onClose, providers, onSelect }) {
  const items = providers
    .filter((provider) => provider.configured !== false)
    .map((provider) => ({
      id: provider.id,
      label: provider.name,
      icon: markFor(provider.id),
      onSelect: () => onSelect(provider.id),
    }))

  return <AnchoredMenu open={open} anchor={anchor} onClose={onClose} label="Conectar nova conta" items={items} />
}
