import { matchPath } from 'react-router-dom'
import {
  ROUTES,
  driveFolderUrl,
  driveUrl,
} from '../../../../shared/config/routes.js'

function item(label, extras = {}) {
  return { label, to: null, current: false, ...extras }
}

function homeCrumb() {
  return item('Início', { to: ROUTES.home })
}

// `catalog.getProvider` resolves an account (connection id) to the provider shown for it.
function providerCrumb(catalog, connectionId, { current = false } = {}) {
  const resolved = catalog.getProvider(connectionId)
  return item(resolved?.name ?? 'Provedor', {
    to: current ? null : driveUrl(connectionId),
    current,
    providerId: resolved?.id ?? connectionId,
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

function folderCrumbs(catalog, connectionId, folderRef, { current = false } = {}) {
  if (!folderRef) return []
  if (typeof catalog.providerHasFolder === 'function' && !catalog.providerHasFolder(connectionId, folderRef)) {
    return []
  }

  const ancestry = resolveAncestry(catalog, folderRef)
  return ancestry.map((folder, index) => {
    const isLast = index === ancestry.length - 1
    return item(folder.name, {
      to: current && isLast ? null : driveFolderUrl(connectionId, folder.folderRef ?? folder.ref),
      current: current && isLast,
    })
  })
}

export function resolveSpaceViewBreadcrumb(pathname, catalog) {
  const driveFile = matchPath({ path: ROUTES.driveFile, end: true }, pathname)
  if (driveFile) {
    const { connectionId, fileRef } = driveFile.params
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
                  : driveFolderUrl(connectionId, folder.ref ?? folder.folderRef),
              current: false,
            }),
          )
        : folderCrumbs(catalog, connectionId, parentRef)
    return {
      items: [
        homeCrumb(),
        providerCrumb(catalog, connectionId),
        ...folderTrail,
        item(file?.name ?? file?.title ?? 'Arquivo', { current: true }),
      ],
    }
  }

  const driveFolder = matchPath({ path: ROUTES.driveFolder, end: true }, pathname)
  if (driveFolder) {
    const { connectionId, folderRef } = driveFolder.params
    const crumbs = folderCrumbs(catalog, connectionId, folderRef, { current: true })
    return {
      items: [
        homeCrumb(),
        providerCrumb(catalog, connectionId),
        ...(crumbs.length
          ? crumbs
          : [item(catalog.getFolder(folderRef)?.name ?? 'Pasta', { current: true })]),
      ],
    }
  }

  const drive = matchPath({ path: ROUTES.drive, end: true }, pathname)
  if (drive) {
    return {
      items: [
        homeCrumb(),
        providerCrumb(catalog, drive.params.connectionId, { current: true }),
      ],
    }
  }

  return {
    items: [item('Início', { current: true })],
  }
}
