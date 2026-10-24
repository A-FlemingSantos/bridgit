import { useId, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import ProviderMark from '../../../features/spaces/components/ProviderMark.jsx'
import { useProviders } from '../../hub/index.js'
import AnchoredSuspendedMenu from '../SuspendedMenu/AnchoredSuspendedMenu.jsx'
import { useSuspendedMenu } from '../SuspendedMenu/useSuspendedMenu.js'

const markIcons = new Map()

// The menu icon slot receives { size, strokeWidth }; one stable component per provider.
function markIcon(providerId) {
  if (!markIcons.has(providerId)) {
    markIcons.set(providerId, function ProviderMenuIcon({ size }) {
      return <ProviderMark id={providerId} size={size} />
    })
  }
  return markIcons.get(providerId)
}

// A button (styled by the caller) that opens the list of configured providers; choosing one starts
// the OAuth flow to add one more account, coming back to `redirectTo` (by default the page the person is on).
// Built from the same menu pieces as OverflowMenu, which only offers an ellipsis trigger.
export default function AddAccountMenu({
  children,
  className,
  label = 'Nova conta',
  title,
  prefer = 'below',
  redirectTo,
  onError,
}) {
  const location = useLocation()
  const returnTo = redirectTo ?? location.pathname + location.search
  const { providers, connect } = useProviders()
  const menuId = useId()
  const triggerId = useId()
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const menu = useSuspendedMenu(providers.length, { menuRef })
  const { closeMenu } = menu

  const items = useMemo(
    () =>
      providers
        .filter((provider) => provider.configured)
        .map((provider) => ({
          id: provider.id,
          label: provider.name,
          icon: markIcon(provider.id),
          onSelect: () => {
            closeMenu()
            Promise.resolve(connect(provider.id, returnTo, { addAccount: true }))
              .catch((error) => onError?.(error))
          },
        })),
    [providers, connect, returnTo, onError, closeMenu],
  )

  return (
    <div ref={menu.dockRef} style={{ display: 'contents' }}>
      <button
        type="button"
        id={triggerId}
        ref={triggerRef}
        className={className}
        aria-label={label}
        title={title}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-controls={menuId}
        disabled={items.length === 0}
        onClick={menu.toggleMenu}
      >
        {children}
      </button>
      <AnchoredSuspendedMenu
        id={menuId}
        labelledBy={triggerId}
        open={menu.open}
        closing={menu.closing}
        items={items}
        title="Nova conta"
        triggerRef={triggerRef}
        panelRef={menuRef}
        prefer={prefer}
      />
    </div>
  )
}
