const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'heic', 'tif', 'tiff'])
const DROPBOX_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'tiff', 'tif', 'gif', 'webp', 'ppm', 'bmp'])
const WORD_EXTENSIONS = new Set(['doc', 'docx', 'docm'])
const EXCEL_EXTENSIONS = new Set(['xls', 'xlsx', 'xlsm', 'xlsb'])
const POWERPOINT_EXTENSIONS = new Set(['ppt', 'pptx', 'pptm', 'pps', 'ppsx'])

const GOOGLE_DOCUMENT = 'application/vnd.google-apps.document'
const GOOGLE_SPREADSHEET = 'application/vnd.google-apps.spreadsheet'
const GOOGLE_PRESENTATION = 'application/vnd.google-apps.presentation'

const DROPBOX_MAX_BYTES = 20 * 1024 * 1024

function extensionOf(file) {
  return String(file?.extension ?? '').toLowerCase()
}

function mimeOf(file) {
  return String(file?.mimeType ?? '').toLowerCase()
}

export function officeBadge(file) {
  const extension = extensionOf(file)
  const mime = mimeOf(file)
  if (WORD_EXTENSIONS.has(extension) || mime === GOOGLE_DOCUMENT) return 'word'
  if (EXCEL_EXTENSIONS.has(extension) || mime === GOOGLE_SPREADSHEET) return 'excel'
  if (POWERPOINT_EXTENSIONS.has(extension) || mime === GOOGLE_PRESENTATION) return 'powerpoint'
  return null
}

export function thumbnailEligible(providerId, file) {
  if (!file || file.kind === 'folder' || file.pending) return false
  const extension = extensionOf(file)
  const mime = mimeOf(file)
  if (providerId === 'dropbox') {
    if (!DROPBOX_IMAGE_EXTENSIONS.has(extension)) return false
    return typeof file.size !== 'number' || file.size <= DROPBOX_MAX_BYTES
  }
  if (mime.startsWith('image/') || IMAGE_EXTENSIONS.has(extension)) return true
  if (mime === 'application/pdf' || extension === 'pdf') return true
  if (officeBadge(file)) return true
  return false
}
