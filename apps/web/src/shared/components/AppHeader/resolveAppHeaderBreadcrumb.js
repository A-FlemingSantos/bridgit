import { matchPath } from 'react-router-dom'
import {
  getFile,
  getFolder,
  getProvider,
  getSpace,
} from '../../../features/spaces/data/mock.js'
import { ROUTES, spaceUrl } from '../../config/routes.js'

function item(label, { to = null, current = false } = {}) {
  return { label, to, current }
}

export function resolveAppHeaderBreadcrumb(pathname) {
  const spaceFile = matchPath({ path: ROUTES.spaceFile, end: true }, pathname)
  if (spaceFile) {
    const space = getSpace(spaceFile.params.space)
    const file = getFile(spaceFile.params.fileRef)
    return {
      items: [
        item('Spaces', { to: ROUTES.spaces }),
        item(space?.name ?? 'Space', { to: space ? spaceUrl(space.slug) : ROUTES.spaces }),
        item(file?.title ?? 'Arquivo', { current: true }),
      ],
    }
  }

  const spaceFolder = matchPath({ path: ROUTES.spaceFolder, end: true }, pathname)
  if (spaceFolder) {
    const space = getSpace(spaceFolder.params.space)
    const folder = getFolder(spaceFolder.params.folderRef)
    return {
      items: [
        item('Spaces', { to: ROUTES.spaces }),
        item(space?.name ?? 'Space', { to: space ? spaceUrl(space.slug) : ROUTES.spaces }),
        item(folder?.name ?? 'Pasta', { current: true }),
      ],
    }
  }

  const space = matchPath({ path: ROUTES.space, end: true }, pathname)
  if (space) {
    const resolved = getSpace(space.params.space)
    return {
      items: [
        item('Spaces', { to: ROUTES.spaces }),
        item(resolved?.name ?? 'Space', { current: true }),
      ],
    }
  }

  const provider = matchPath({ path: ROUTES.provider, end: true }, pathname)
  if (provider) {
    const resolved = getProvider(provider.params.provider)
    return {
      items: [
        item('Spaces', { to: ROUTES.spaces }),
        item(resolved?.name ?? 'Provedor', { current: true }),
      ],
    }
  }

  return {
    items: [item('Spaces', { current: true })],
  }
}
