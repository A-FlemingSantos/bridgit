import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppOverlay, { overlayStyles as styles } from '../../../../shared/components/AppOverlay/AppOverlay.jsx'
import { spaceUrl } from '../../../../shared/config/routes.js'
import {
  getSpace,
  locationLabel,
  uniqueSlug,
} from '../../../../shared/state/hubStore.js'
import { useHub } from '../../../../shared/state/HubState.jsx'
import ProviderMark from '../ProviderMark.jsx'
import { useLocationPicker } from '../LocationPicker/useLocationPicker.jsx'

function SideButton({ label, location, onClick }) {
  return (
    <button type="button" className={styles.pick} onClick={onClick}>
      {location ? <ProviderMark id={location.providerId} size={22} /> : null}
      <span className={styles.pickMeta}>
        <span className={styles.pickTitle}>{location ? locationLabel(location) : label}</span>
        <span className={styles.pickSub}>
          {location
            ? `${location.kind === 'file' ? 'Arquivo' : 'Pasta'} · ${location.provider}`
            : 'Provedor distinto'}
        </span>
      </span>
    </button>
  )
}

export default function SpaceComposer({ overlay }) {
  const { state, dispatch, closeOverlay } = useHub()
  const navigate = useNavigate()
  const isCreate = overlay.mode === 'create'
  const space = overlay.spaceId ? getSpace(state, overlay.spaceId) : null
  const [name, setName] = useState(isCreate ? '' : space?.name ?? '')
  const [left, setLeft] = useState(overlay.left ?? null)
  const [right, setRight] = useState(overlay.right ?? null)
  const [picking, setPicking] = useState(null)
  const [hint, setHint] = useState('')

  const excludeProviderId =
    picking === 'right' ? left?.providerId : picking === 'left' ? right?.providerId : null

  const picker = useLocationPicker({
    excludeProviderId,
    resetKey: picking,
    onChoose: (location) => {
      if (picking === 'left') setLeft(location)
      if (picking === 'right') setRight(location)
      setPicking(null)
      setHint('')
    },
  })

  const filled = [left, right].filter(Boolean).length
  const sameProvider = Boolean(left && right && left.providerId === right.providerId)
  const canSubmit = useMemo(() => {
    if (isCreate && !name.trim()) return false
    if (filled === 1) return false
    if (!isCreate && filled !== 2) return false
    if (sameProvider) return false
    return true
  }, [isCreate, name, filled, sameProvider])

  function submit() {
    if (!canSubmit) {
      if (filled === 1) setHint('Escolha os dois lados, ou nenhum.')
      else if (sameProvider) setHint('A sinc é entre provedores distintos.')
      return
    }

    if (isCreate) {
      const slug = uniqueSlug(name, state.spaces)
      dispatch({ type: 'createSpace', name, left, right })
      navigate(spaceUrl(slug))
      return
    }

    dispatch({
      type: 'addPair',
      spaceId: overlay.spaceId,
      left,
      right,
    })
  }

  return (
    <AppOverlay
      title={picking ? picker.title : isCreate ? 'Novo space' : 'Novo espelho'}
      onClose={closeOverlay}
      compact={!picking}
      trailing={
        picking ? (
          picker.trailing
        ) : (
          <button type="button" className={styles.choose} disabled={!canSubmit} onClick={submit}>
            {isCreate ? 'Criar' : 'Adicionar'}
          </button>
        )
      }
      refreshKey={picking ? picker.refreshKey : isCreate ? 'create-space' : 'add-pair'}
    >
      {picking ? (
        <>
          {picker.stage === 'providers' ? (
            <button type="button" className={styles.more} onClick={() => setPicking(null)}>
              Voltar
            </button>
          ) : null}
          {picker.body}
        </>
      ) : (
        <>
          {isCreate ? (
            <div className={styles.field}>
              <label htmlFor="space-name">Nome</label>
              <input
                id="space-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="off"
              />
            </div>
          ) : (
            <p className={styles.lead}>
              {space?.name}: o hub orquestra o espelho. A cópia continua em cada provedor.
            </p>
          )}

          <div className={styles.stack}>
            <SideButton label="De" location={left} onClick={() => setPicking('left')} />
            <SideButton label="Para" location={right} onClick={() => setPicking('right')} />
          </div>

          {hint ? (
            <p className={styles.hint}>{hint}</p>
          ) : (
            <p className={styles.hint}>
              {isCreate
                ? 'Opcional: já ligar o primeiro espelho entre duas nuvens.'
                : 'Dois lados, provedores diferentes.'}
            </p>
          )}
        </>
      )}
    </AppOverlay>
  )
}
