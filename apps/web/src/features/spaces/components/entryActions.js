import { makeFileLocation } from '../../../shared/state/hubStore.js'

export function fileMenuItems(item, { openOverlay, dispatch, state }) {
  const shortcut = state.shortcuts.includes(item.fileRef)
  return [
    {
      id: 'mirror',
      label: 'Espelhar',
      onSelect: () =>
        openOverlay({ type: 'composer', mode: 'create', left: makeFileLocation(item) }),
    },
    {
      id: 'link',
      label: 'Link público',
      onSelect: () => openOverlay({ type: 'public-link', fileRef: item.fileRef }),
    },
    {
      id: 'pin',
      label: shortcut ? 'Remover atalho' : 'Atalho',
      onSelect: () => dispatch({ type: 'toggleShortcut', fileRef: item.fileRef }),
    },
  ]
}
