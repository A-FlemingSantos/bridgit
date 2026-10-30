// Which files the cloud draws a preview for, and the queue that fetches them. Ported from the web
// (FileThumb/thumbnailEligibility.js and shared/hub/thumbnailQueue.js); storage stays with the caller.

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'heic', 'tif', 'tiff'])
const DROPBOX_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'tiff', 'tif', 'gif', 'webp', 'ppm', 'bmp'])
const WORD_EXTENSIONS = new Set(['doc', 'docx', 'docm'])
const EXCEL_EXTENSIONS = new Set(['xls', 'xlsx', 'xlsm', 'xlsb'])
const POWERPOINT_EXTENSIONS = new Set(['ppt', 'pptx', 'pptm', 'pps', 'ppsx'])

const GOOGLE_DOCUMENT = 'application/vnd.google-apps.document'
const GOOGLE_SPREADSHEET = 'application/vnd.google-apps.spreadsheet'
const GOOGLE_PRESENTATION = 'application/vnd.google-apps.presentation'

const DROPBOX_MAX_BYTES = 20 * 1024 * 1024
// Measured against the clouds: OneDrive draws .txt and .md pages, Drive only .txt, Dropbox neither.
const TEXT_EXTENSIONS = {
  onedrive: new Set(['txt', 'md']),
  'google-drive': new Set(['txt']),
}

function extensionOf(file) {
  return String(file?.extension ?? '').replace(/^\./, '').toLowerCase()
}

function mimeOf(file) {
  return String(file?.mimeType ?? '').toLowerCase()
}

function isFolder(file) {
  return file?.isFolder === true || file?.kind === 'folder'
}

// The Office or Google kind of a file, for its logo: 'word', 'excel', 'powerpoint', 'google-docs',
// 'google-sheets', 'google-slides', or null.
export function officeBadge(file) {
  const extension = extensionOf(file)
  const mime = mimeOf(file)
  // Native Google files carry Google's own logos, never Microsoft's.
  if (mime === GOOGLE_DOCUMENT) return 'google-docs'
  if (mime === GOOGLE_SPREADSHEET) return 'google-sheets'
  if (mime === GOOGLE_PRESENTATION) return 'google-slides'
  if (WORD_EXTENSIONS.has(extension)) return 'word'
  if (EXCEL_EXTENSIONS.has(extension)) return 'excel'
  if (POWERPOINT_EXTENSIONS.has(extension)) return 'powerpoint'
  return null
}

// `provider` is the kind of cloud ('onedrive', 'google-drive', 'dropbox'), never an account id.
export function thumbnailEligible(provider, file) {
  if (!file || isFolder(file) || file.pending) return false
  const extension = extensionOf(file)
  const mime = mimeOf(file)
  if (provider === 'dropbox') {
    if (!DROPBOX_IMAGE_EXTENSIONS.has(extension)) return false
    return typeof file.size !== 'number' || file.size <= DROPBOX_MAX_BYTES
  }
  if (mime.startsWith('image/') || IMAGE_EXTENSIONS.has(extension)) return true
  if (mime === 'application/pdf' || extension === 'pdf') return true
  if (officeBadge(file)) return true
  return TEXT_EXTENSIONS[provider]?.has(extension) === true
}

// Drive draws a native Google file's thumbnail a little after each edit and serves the old or a blank one
// meanwhile, so a preview fetched this soon is shown but not kept.
const NATIVE_PREVIEW_SETTLE_MS = 10 * 60 * 1000

export function previewSettling(file, now = Date.now()) {
  if (!mimeOf(file).startsWith('application/vnd.google-apps.')) return false
  const modified = Date.parse(file?.modifiedAt ?? '')
  return Number.isFinite(modified) && now - modified < NATIVE_PREVIEW_SETTLE_MS
}

const MAX_IN_FLIGHT = 4
const MISS_TTL_MS = 60 * 60 * 1000

/**
 * A queue of preview loads. `load(key, { readStored, fetchRemote, keep })` resolves the preview's URI,
 * or null without one. What the device kept (`readStored`) is read right away; only the trip to the
 * cloud (`fetchRemote`) waits for one of the few slots. A 404 (or an empty answer) is remembered as
 * "no preview" for an hour; other failures are tried again on the next load. `keep: false` shows a
 * preview without remembering it, for one the cloud may still be redrawing.
 */
export function createThumbnailQueue({ maxInFlight = MAX_IN_FLIGHT, missTtl = MISS_TTL_MS, now = () => Date.now() } = {}) {
  let active = 0
  const waiters = []
  const known = new Map()
  const inflight = new Map()

  function acquire() {
    if (active < maxInFlight) {
      active += 1
      return Promise.resolve()
    }
    return new Promise((resolve) => waiters.push(resolve))
  }

  function release() {
    const next = waiters.shift()
    if (next) next()
    else active -= 1
  }

  // The URI, null for a recent miss, or undefined when nothing is known.
  function cached(key) {
    const entry = known.get(key)
    if (entry?.status === 'ok') return entry.uri
    if (entry?.status === 'miss') {
      if (now() - entry.at < missTtl) return null
      known.delete(key)
    }
    return undefined
  }

  function remember(key, uri) {
    known.set(key, uri ? { status: 'ok', uri } : { status: 'miss', at: now() })
    return uri ?? null
  }

  async function run(key, readStored, fetchRemote, keep) {
    if (keep && typeof readStored === 'function') {
      const stored = await readStored().catch(() => null)
      if (stored) return remember(key, stored)
    }
    await acquire()
    try {
      const uri = await fetchRemote()
      return keep ? remember(key, uri) : uri ?? null
    } catch (error) {
      if (error?.status === 404) return remember(key, null)
      return null
    } finally {
      release()
    }
  }

  function load(key, { readStored = null, fetchRemote, keep = true }) {
    const hit = cached(key)
    if (hit !== undefined) return Promise.resolve(hit)
    const pending = inflight.get(key)
    if (pending) return pending
    const request = run(key, readStored, fetchRemote, keep).finally(() => inflight.delete(key))
    inflight.set(key, request)
    return request
  }

  return { load, peek: cached }
}
