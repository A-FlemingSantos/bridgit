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

function resolveAncestry(catalog, folderRef) {
  if (!folderRef) return []
  if (typeof catalog.getFolderAncestry === 'function') {
    return catalog.getFolderAncestry(folderRef)
  }

  const chain = []
  const seen = new Set()
  let currentRef = folderRef

  while (currentRef && !seen.has(currentRef)) {
    seen.add(currentRef)
    const folder = catalog.getFolder(currentRef)
    if (!folder) break
    chain.unshift(folder)
    currentRef = folder.parentFolderRef ?? null
  }

  return chain
}

function folderCrumbs(catalog, providerId, folderRef, { current = false } = {}) {
  if (!folderRef) return []
  if (typeof catalog.providerHasFolder === 'function' && !catalog.providerHasFolder(providerId, folderRef)) {
    return []
  }

  const ancestry = resolveAncestry(catalog, folderRef)
  return ancestry.map((folder, index) => {
    const isLast = index === ancestry.length - 1
    return item(folder.name, {
      to: current && isLast ? null : providerFolderUrl(providerId, folder.folderRef ?? folder.ref),
      current: current && isLast,
    })
  })
}

export function resolveSpaceViewBreadcrumb(pathname, catalog) {
  const providerFile = matchPath({ path: ROUTES.providerFile, end: true }, pathname)
  if (providerFile) {
    const { provider: providerId, fileRef } = providerFile.params
    const file = catalog.getFile(fileRef)
    const parentRef = file?.parentRef ?? file?.folderRef ?? null
    const fileAncestry = file?.ancestry ?? null
    const folderTrail =
      fileAncestry?.length > 0
        ? fileAncestry.map((folder, index) =>
            item(folder.name ?? folder.title, {
              to:
                index === fileAncestry.length - 1
                  ? null
                  : providerFolderUrl(providerId, folder.ref ?? folder.folderRef),
              current: false,
            }),
          )
        : folderCrumbs(catalog, providerId, parentRef)
    return {
      items: [
        homeCrumb(),
        providerCrumb(catalog, providerId),
        ...folderTrail,
        item(file?.name ?? file?.title ?? 'Arquivo', { current: true }),
      ],
    }
  }

  const providerFolder = matchPath({ path: ROUTES.providerFolder, end: true }, pathname)
  if (providerFolder) {
    const { provider: providerId, folderRef } = providerFolder.params
    const crumbs = folderCrumbs(catalog, providerId, folderRef, { current: true })
    return {
      items: [
        homeCrumb(),
        providerCrumb(catalog, providerId),
        ...(crumbs.length
          ? crumbs
          : [item(catalog.getFolder(folderRef)?.name ?? 'Pasta', { current: true })]),
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
