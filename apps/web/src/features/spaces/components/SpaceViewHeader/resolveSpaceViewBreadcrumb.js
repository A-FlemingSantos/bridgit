import { matchPath } from 'react-router-dom'
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

function providerCrumb(catalog, providerId, { current = false } = {}) {
  const resolved = catalog.getProvider(providerId)
  return item(resolved?.name ?? 'Provedor', {
    to: current ? null : providerUrl(providerId),
    current,
    providerId: resolved?.id ?? providerId,
  })
}

function parentFolderCrumb(catalog, file, providerId) {
  if (!file?.folderRef) return []
  const folder = catalog.getFolder(file.folderRef)
  if (!folder) return []
  if (!catalog.providerHasFolder(providerId, file.folderRef)) return []
  return [item(folder.name, { to: providerFolderUrl(providerId, file.folderRef) })]
}

export function resolveSpaceViewBreadcrumb(pathname, catalog) {
  const providerFile = matchPath({ path: ROUTES.providerFile, end: true }, pathname)
  if (providerFile) {
    const { provider: providerId, fileRef } = providerFile.params
    const file = catalog.getFile(fileRef)
    return {
      items: [
        homeCrumb(),
        providerCrumb(catalog, providerId),
        ...parentFolderCrumb(catalog, file, providerId),
        item(file?.title ?? 'Arquivo', { current: true }),
      ],
    }
  }

  const providerFolder = matchPath({ path: ROUTES.providerFolder, end: true }, pathname)
  if (providerFolder) {
    const { provider: providerId, folderRef } = providerFolder.params
    const folder = catalog.getFolder(folderRef)
    return {
      items: [
        homeCrumb(),
        providerCrumb(catalog, providerId),
        item(folder?.name ?? 'Pasta', { current: true }),
      ],
    }
  }

  const provider = matchPath({ path: ROUTES.provider, end: true }, pathname)
  if (provider) {
    return {
      items: [
        homeCrumb(),
        providerCrumb(catalog, provider.params.provider, { current: true }),
      ],
    }
  }

  return {
    items: [item('Início', { current: true })],
  }
}
