import { matchPath } from 'react-router-dom'
import {
  getFile,
  getFolder,
  getProvider,
  getSpace,
  providerHasFolder,
  spaceHasFolder,
} from '../../data/mock.js'
import {
  ROUTES,
  providerFolderUrl,
  providerUrl,
  spaceFolderUrl,
  spaceUrl,
} from '../../../../shared/config/routes.js'

function item(label, extras = {}) {
  return { label, to: null, current: false, ...extras }
}

function providerCrumb(providerId, { current = false } = {}) {
  const resolved = getProvider(providerId)
  return item(resolved?.name ?? 'Provedor', {
    to: current ? null : providerUrl(providerId),
    current,
    providerId: resolved?.id ?? providerId,
  })
}

function parentFolderCrumb(file, { spaceSlug, providerId }) {
  if (!file?.folderRef) return []
  const folder = getFolder(file.folderRef)
  if (!folder) return []

  if (providerId) {
    if (!providerHasFolder(providerId, file.folderRef)) return []
    return [item(folder.name, { to: providerFolderUrl(providerId, file.folderRef) })]
  }

  if (spaceSlug) {
    if (!spaceHasFolder(spaceSlug, file.folderRef)) return []
    return [item(folder.name, { to: spaceFolderUrl(spaceSlug, file.folderRef) })]
  }

  return []
}

export function resolveSpaceViewBreadcrumb(pathname) {
  const providerFile = matchPath({ path: ROUTES.providerFile, end: true }, pathname)
  if (providerFile) {
    const { provider: providerId, fileRef } = providerFile.params
    const file = getFile(fileRef)
    return {
      items: [
        item('Spaces', { to: ROUTES.spaces }),
        providerCrumb(providerId),
        ...parentFolderCrumb(file, { providerId }),
        item(file?.title ?? 'Arquivo', { current: true }),
      ],
    }
  }

  const providerFolder = matchPath({ path: ROUTES.providerFolder, end: true }, pathname)
  if (providerFolder) {
    const { provider: providerId, folderRef } = providerFolder.params
    const folder = getFolder(folderRef)
    return {
      items: [
        item('Spaces', { to: ROUTES.spaces }),
        providerCrumb(providerId),
        item(folder?.name ?? 'Pasta', { current: true }),
      ],
    }
  }

  const spaceFile = matchPath({ path: ROUTES.spaceFile, end: true }, pathname)
  if (spaceFile) {
    const spaceSlug = spaceFile.params.space
    const space = getSpace(spaceSlug)
    const file = getFile(spaceFile.params.fileRef)
    return {
      items: [
        item('Spaces', { to: ROUTES.spaces }),
        item(space?.name ?? 'Space', { to: space ? spaceUrl(space.slug) : ROUTES.spaces }),
        ...parentFolderCrumb(file, { spaceSlug }),
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
    return {
      items: [
        item('Spaces', { to: ROUTES.spaces }),
        providerCrumb(provider.params.provider, { current: true }),
      ],
    }
  }

  return {
    items: [item('Spaces', { current: true })],
  }
}
