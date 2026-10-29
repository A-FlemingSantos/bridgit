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
  return String(file?.extension ?? '').toLowerCase()
}

function mimeOf(file) {
  return String(file?.mimeType ?? '').toLowerCase()
}

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
  if (!file || file.kind === 'folder' || file.pending) return false
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
