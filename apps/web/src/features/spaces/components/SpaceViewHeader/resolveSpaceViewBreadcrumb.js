import { matchPath } from 'react-router-dom'
import {
  getFile,
  getFolder,
  getProvider,
  providerHasFolder,
} from '../../data/mock.js'
import {
  ROUTES,
  providerFolderUrl,
  providerUrl,
} from '../../../../shared/config/routes.js'

function item(label, extras = {}) {
  return { label, to: null, current: false, ...extras }
}

function homeCrumb() {
  return item('Início', { to: ROUTES.home })
}

function providerCrumb(providerId, { current = false } = {}) {
  const resolved = getProvider(providerId)
  return item(resolved?.name ?? 'Provedor', {
    to: current ? null : providerUrl(providerId),
    current,
    providerId: resolved?.id ?? providerId,
  })
}

function parentFolderCrumb(file, providerId) {
  if (!file?.folderRef) return []
  const folder = getFolder(file.folderRef)
  if (!folder) return []
  if (!providerHasFolder(providerId, file.folderRef)) return []
  return [item(folder.name, { to: providerFolderUrl(providerId, file.folderRef) })]
}

export function resolveSpaceViewBreadcrumb(pathname) {
  const providerFile = matchPath({ path: ROUTES.providerFile, end: true }, pathname)
  if (providerFile) {
    const { provider: providerId, fileRef } = providerFile.params
    const file = getFile(fileRef)
    return {
      items: [
        homeCrumb(),
        providerCrumb(providerId),
        ...parentFolderCrumb(file, providerId),
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
        homeCrumb(),
        providerCrumb(providerId),
        item(folder?.name ?? 'Pasta', { current: true }),
      ],
    }
  }

  const provider = matchPath({ path: ROUTES.provider, end: true }, pathname)
  if (provider) {
    return {
      items: [
        homeCrumb(),
        providerCrumb(provider.params.provider, { current: true }),
      ],
    }
  }

  return {
    items: [item('Início', { current: true })],
  }
}
