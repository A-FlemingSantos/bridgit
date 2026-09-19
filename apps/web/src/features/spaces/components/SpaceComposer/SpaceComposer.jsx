import { useMemo, useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AppOverlay, { overlayStyles as styles } from '../../../../shared/components/AppOverlay/AppOverlay.jsx'
import { spaceUrl } from '../../../../shared/config/routes.js'
import {
  getFolder,
  isFolderLocation,
  locationPath,
  makeFolderLocationFromState,
  uniqueSlug,
} from '../../../../shared/state/hubStore.js'
import { useHub } from '../../../../shared/state/HubState.jsx'
import ProviderMark from '../ProviderMark.jsx'
import { useLocationPicker } from '../LocationPicker/useLocationPicker.jsx'

function asFolderLocation(state, location) {
  if (isFolderLocation(location)) return location
  if (location?.kind === 'folder' && location.ref) {
    return makeFolderLocationFromState(state, location.ref)
  }
  if (location?.kind === 'file' && location.folderRef) {
    return makeFolderLocationFromState(state, location.folderRef)
  }
  if (location?.folderRef) {
    const folder = getFolder(state, location.folderRef)
    return folder ? makeFolderLocationFromState(state, folder.folderRef) : null
  }
  return null
}

function sameFolder(left, right) {
  return Boolean(
    isFolderLocation(left) && isFolderLocation(right) && left.ref && left.ref === right.ref,
  )
}

function ProviderTabs({ label, value, options, onChange }) {
  return (
    <div className={styles.tabs} role="tablist" aria-label={label}>
      {options.map((provider) => {
        const selected = provider.id === value
        return (
          <button
            key={provider.id}
            type="button"
            role="tab"
            aria-selected={selected}
            className={selected ? styles.tabActive : styles.tab}
            onClick={() => onChange(provider.id)}
          >
            <ProviderMark id={provider.id} size={16} />
            {provider.name}
          </button>
        )
      })}
    </div>
  )
}

function FolderPickerButton({ location, onClick, label, providerId }) {
  const selected = isFolderLocation(location)
  const markId = selected ? location.providerId : providerId
  return (
    <button
      type="button"
      className={styles.pick}
      onClick={onClick}
      aria-label={selected ? `${label}: ${locationPath(location)}` : `Escolher pasta de ${label}`}
    >
      {markId ? <ProviderMark id={markId} size={22} /> : null}
      <span className={styles.pickMeta}>
        <span className={styles.pickTitle}>
          {selected ? locationPath(location) : 'Escolher pasta'}
        </span>
        <span className={styles.pickSub}>
          {selected ? location.provider : 'Pasta no provedor'}
        </span>
      </span>
    </button>
  )
}

export default function SpaceComposer({ overlay }) {
  const { state, dispatch, closeOverlay } = useHub()
  const navigate = useNavigate()
  const providers = state.providers
  const prefill = asFolderLocation(state, overlay.origin ?? overlay.left ?? null)
  const defaultFrom = prefill?.providerId ?? providers[0]?.id ?? null
  const defaultTo = providers.find((provider) => provider.id !== defaultFrom)?.id ?? providers[0]?.id ?? null

  const [name, setName] = useState('')
  const [fromProviderId, setFromProviderId] = useState(defaultFrom)
  const [toProviderId, setToProviderId] = useState(defaultTo)
  const [origin, setOrigin] = useState(prefill)
  const [destination, setDestination] = useState(null)
  const [picking, setPicking] = useState(null)
  const [hint, setHint] = useState('')

  const pickingProviderId = picking === 'origin' ? fromProviderId : toProviderId
  const otherFolderRef = picking === 'origin' ? destination?.ref : origin?.ref

  const picker = useLocationPicker({
    foldersOnly: true,
    initialProviderId: pickingProviderId,
    disabledFolderRef: otherFolderRef ?? null,
    resetKey: picking,
    onChoose: (location) => {
      if (!isFolderLocation(location)) return
      if (picking === 'origin') setOrigin(location)
      if (picking === 'destination') setDestination(location)
      setPicking(null)
      setHint('')
    },
  })

  const fromReady = isFolderLocation(origin)
  const toReady = isFolderLocation(destination)
  const sameEndpoint = sameFolder(origin, destination)
  const canSubmit = useMemo(() => {
    if (!name.trim()) return false
    if (!fromReady || !toReady) return false
    if (sameEndpoint) return false
    return true
  }, [name, fromReady, toReady, sameEndpoint])

  function changeFromProvider(id) {
    setFromProviderId(id)
    if (origin?.providerId !== id) setOrigin(null)
  }

  function changeToProvider(id) {
    setToProviderId(id)
    if (destination?.providerId !== id) setDestination(null)
  }

  function submit() {
    if (!canSubmit) {
      if (!fromReady || !toReady) setHint('Escolha uma pasta em cada lado.')
      else if (sameEndpoint) setHint('Origem e destino não podem ser a mesma pasta.')
      return
    }

    const slug = uniqueSlug(name, state.spaces)
    dispatch({ type: 'createSpace', name, origin, destination })
    navigate(spaceUrl(slug))
  }

  return (
    <AppOverlay
      title={picking ? picker.title : 'Novo space'}
      onClose={closeOverlay}
      compact={false}
      wide={!picking}
      trailing={
        picking ? (
          picker.trailing
        ) : (
          <button
            type="button"
            className={styles.choose}
            disabled={!canSubmit}
            title={sameEndpoint ? 'Origem e destino não podem ser a mesma pasta.' : undefined}
            onClick={submit}
          >
            Criar
          </button>
        )
      }
      refreshKey={picking ? picker.refreshKey : 'create-space'}
    >
      {picking ? (
        <>
          <button type="button" className={styles.more} onClick={() => setPicking(null)}>
            Voltar
          </button>
          {picker.body}
        </>
      ) : (
        <>
          <div className={styles.field}>
            <label htmlFor="space-name">Nome</label>
            <input
              id="space-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
            />
          </div>

          <div className={styles.pair} aria-label="Par de sincronização">
            <div className={styles.endpoint}>
              <span className={styles.endpointLabel}>Origem</span>
              <ProviderTabs
                label="Provedor de origem"
                value={fromProviderId}
                options={providers}
                onChange={changeFromProvider}
              />
              <FolderPickerButton
                label="Origem"
                providerId={fromProviderId}
                location={origin}
                onClick={() => setPicking('origin')}
              />
            </div>

            <span className={styles.direction} aria-hidden="true">
              <ArrowLeftRight size={16} strokeWidth={1.75} />
            </span>

            <div className={styles.endpoint}>
              <span className={styles.endpointLabel}>Destino</span>
              <ProviderTabs
                label="Provedor de destino"
                value={toProviderId}
                options={providers}
                onChange={changeToProvider}
              />
              <FolderPickerButton
                label="Destino"
                providerId={toProviderId}
                location={destination}
                onClick={() => setPicking('destination')}
              />
            </div>
          </div>

          {hint ? <p className={styles.hint}>{hint}</p> : null}
        </>
      )}
    </AppOverlay>
  )
}
