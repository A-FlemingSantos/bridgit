import { makeFolderLocationFromState } from '../../../shared/state/hubStore.js'

export function fileMenuItems(item, { openOverlay, dispatch, state }) {
  const shortcut = state.shortcuts.includes(item.fileRef)
  const origin = item.folderRef ? makeFolderLocationFromState(state, item.folderRef) : null
  return [
    {
      id: 'mirror',
      label: 'Espelhar',
      onSelect: () =>
        openOverlay({ type: 'composer', mode: 'create', origin }),
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
