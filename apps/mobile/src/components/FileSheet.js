import { useWindowDimensions, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { useMobileTheme } from '../theme/ThemeProvider'

// Pixel-art cover for a file, the same drawings as the web FileSheet: a document, or a picture,
// code, chart or slides sheet picked from the file type.
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'heic', 'tif', 'tiff'])

const CODE_EXTENSIONS = new Set([
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'java', 'kt', 'c', 'h', 'cpp', 'hpp', 'cs', 'go', 'rs',
  'rb', 'php', 'swift', 'html', 'htm', 'css', 'scss', 'sass', 'less', 'json', 'xml', 'yml', 'yaml',
  'sh', 'bash', 'ps1', 'sql', 'lua', 'dart', 'vue', 'svelte',
])
const CODE_MIME = /^(application\/(json|javascript|xml|x-sh|x-httpd-php|sql)|text\/(html|css|javascript|x-[\w+-]+))/

const CHART_EXTENSIONS = new Set(['xlsx', 'xls', 'xlsm', 'xlsb', 'ods', 'csv', 'tsv', 'numbers'])
const CHART_MIME = /(spreadsheet|ms-excel|csv|tab-separated)/

const SLIDES_EXTENSIONS = new Set(['pptx', 'ppt', 'pps', 'ppsx', 'pptm', 'odp', 'key'])
const SLIDES_MIME = /(presentation|powerpoint)/

const DOCUMENT_PATH = 'M16 4h-2v4h4V6h2v16H4V2h12v2ZM6 20h12V10h-6V4H6v16Zm10-2H8v-2h8v2Zm0-4H8v-2h8v2Zm-6-4H8V8h2v2Zm8-4h-2V4h2v2Z'
const IMAGE_PATH = 'M8 20h6v-2h2v2h4v2H4v-2h2v-2h2v2Zm-4 0H2V4h2v16Zm18 0h-2v-4h-2v-2h2V4h2v16Zm-12-2H8v-2h2v2Zm4 0h-2v-2h2v2Zm-2-2h-2v-2h2v2Zm4 0h-2v-2h2v2Zm2-2h-2v-2h2v2Zm-8-2H8v-2h2v2Zm-2-2H6V8h2v2Zm4 0h-2V8h2v2Zm-2-2H8V6h2v2Zm10-4H4V2h16v2Z'
const EMPTY_PATH = 'M16 4h-2v4h4V6h2v16H4V2h12v2ZM6 20h12V10h-6V4H6v16ZM18 6h-2V4h2v2Z'
const CODE_PATH = 'M16 4h-2v4h4V6h2v16H4V2h12v2ZM6 20h12V10h-6V4H6v16ZM18 6h-2V4h2v2ZM8 12h2v2H8zM6 14h2v2H6zM8 16h2v2H8zM12 12h2v2h-2zM14 14h2v2h-2zM12 16h2v2h-2z'
const CHART_PATH = 'M16 4h-2v4h4V6h2v16H4V2h12v2ZM6 20h12V10h-6V4H6v16ZM18 6h-2V4h2v2ZM8 16h2v2H8zM11 14h2v4h-2zM14 12h2v6h-2z'
const SLIDES_PATH = 'M6 1h12v2H6zM6 3h2v7H6zM14 3h2v4h-2zM18 3h2v2h-2zM14 7h6v2h-6zM20 5h2v16h-2zM15 19h5v2h-5zM2 11h12v1H2zM2 22h12v1H2zM2 12h1v10H2zM13 12h1v10h-1zM5 14h5v1H5zM5 15h6v1H5zM5 16h2v1H5zM9 16h2v1H9zM5 17h6v1H5zM5 18h5v1H5zM5 19h2v1H5z'

function extensionOf(file) {
  const explicit = String(file.extension ?? '').replace(/^\./, '').toLowerCase()
  if (explicit) return explicit
  const name = String(file.name ?? '')
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function coverPath(file) {
  if (!file) return DOCUMENT_PATH
  // Only an exact 0 means empty: a missing size is just unknown.
  if (file.size === 0) return EMPTY_PATH
  const mime = typeof file.mimeType === 'string' ? file.mimeType : ''
  const extension = extensionOf(file)
  if (mime.startsWith('image/') || IMAGE_EXTENSIONS.has(extension)) return IMAGE_PATH
  if (CODE_MIME.test(mime) || CODE_EXTENSIONS.has(extension)) return CODE_PATH
  if (CHART_MIME.test(mime) || CHART_EXTENSIONS.has(extension)) return CHART_PATH
  if (SLIDES_MIME.test(mime) || SLIDES_EXTENSIONS.has(extension)) return SLIDES_PATH
  return DOCUMENT_PATH
}

// `size` is the drawing's side in px; `compact` (24) and `large` are the shorthands the screens use.
export default function FileSheet({ file = null, size = 56, compact = false, large = false }) {
  const { theme, isDark } = useMobileTheme()
  const { width } = useWindowDimensions()
  const side = compact ? 24 : large ? Math.min(220, Math.round(width * 0.42)) : size

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg
        width={side}
        height={side}
        viewBox="0 0 24 24"
        fill={theme.colors.ink}
        fillOpacity={isDark ? 0.55 : 0.38}
        shapeRendering="crispEdges"
      >
        <Path d={coverPath(file)} />
      </Svg>
    </View>
  )
}
