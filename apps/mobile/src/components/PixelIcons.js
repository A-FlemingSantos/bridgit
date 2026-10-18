import Svg, { Path } from 'react-native-svg'

// Pixel-art icons shared with the web app (apps/web PixelIcons), drawn on a 24-unit grid with
// 2-unit cells. They take the same { size, color } props as the lucide icons they replace, so menus
// and buttons render either kind; a pixel icon looks sharpest at 24 or a multiple of 12.
function pixelIcon(d) {
  function PixelIcon({ size = 24, color = '#000' }) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill={color} shapeRendering="crispEdges">
        <Path d={d} />
      </Svg>
    )
  }
  return PixelIcon
}

export const PixelBookmark = pixelIcon('M6 2h12v2H6zM4 4h2v18H4zm14 0h2v18h-2zm-2 16h2v2h-2zm-2-2h2v2h-2zm-8 2h2v2H6zm2-2h2v2H8zm2-2h4v2h-4z')
export const PixelLink = pixelIcon('M11 18H4v-2h7v2Zm9 0h-7v-2h7v2ZM4 16H2V8h2v8Zm18 0h-2V8h2v8Zm-5-3H7v-2h10v2Zm-6-5H4V6h7v2Zm9 0h-7V6h7v2Z')
export const PixelUnlink = pixelIcon('M13 20h-2V4h2v16Zm-4-2H4v-2h5v2Zm11 0h-5v-2h5v2ZM4 16H2V8h2v8Zm18 0h-2V8h2v8ZM9 8H4V6h5v2Zm11 0h-5V6h5v2Z')
export const PixelPencil = pixelIcon('M4 16H6V18H8V20H10V22H2V14H4V16ZM12 20H10V18H12V20ZM14 18H12V16H14V18ZM10 16H8V14H10V16ZM16 16H14V14H16V16ZM6 14H4V12H6V14ZM12 14H10V12H12V14ZM18 14H16V12H18V14ZM8 12H6V10H8V12ZM14 12H12V10H14V12ZM20 12H18V10H20V12ZM10 10H8V8H10V10ZM18 10H16V8H18V10ZM22 10H20V8H22V10ZM12 8H10V6H12V8ZM16 8H14V6H16V8ZM20 8H18V6H20V8ZM14 6H12V4H14V6ZM18 6H16V4H18V6ZM16 4H14V2H16V4Z')
export const PixelBrush = pixelIcon('M3 21h2v2H1v-4h2v2Zm6 0H5v-2h4v2Zm-4-2H3v-4h2v4Zm6 0H9v-2h2v2Zm2-2h-2v-2h2v2Zm-6-2H5v-2h2v2Zm8 0h-2v-2h2v2Zm4 0h-2v-2h2v2ZM9 13H7v-2h2v2Zm8 0h-2v-2h2v2Zm4 0h-2v-2h2v2Zm-10-2H9V9h2v2Zm4 0h-2V9h2v2Zm4 0h-2V9h2v2Zm-6-2h-2V7h2v2Zm8 0h-2V7h2v2ZM11 7H9V5h2v2Zm4 0h-2V5h2v2Zm8 0h-2V5h2v2ZM13 5h-2V3h2v2Zm4 0h-2V3h2v2Zm4 0h-2V3h2v2Zm-2-2h-2V1h2v2Z')
export const PixelDownload = pixelIcon('M19 21H5v-2h14v2ZM5 19H3v-4h2v4Zm16 0h-2v-4h2v4Zm-8-8h4v2h-2v2h-2v2h-2v-2H9v-2H7v-2h4V3h2v8Z')
export const PixelCopy = pixelIcon('M20 22H8v-2h12v2ZM8 20H6v-2H4v-2h2V8h2v12Zm14 0h-2V8h2v12ZM4 16H2V4h2v12ZM18 6h2v2H8V6h8V4h2v2Zm-2-2H4V2h12v2Z')
export const PixelEye = pixelIcon('M16 20H8v-2h8v2Zm-8-2H4v-2h4v2Zm12 0h-4v-2h4v2ZM4 16H2v-2h2v2Zm10-6h-2v2h2v-2h2v4h-2v2h-4v-2H8v-4h2V8h4v2Zm8 6h-2v-2h2v2ZM2 14H0v-4h2v4Zm22 0h-2v-4h2v4ZM4 10H2V8h2v2Zm18 0h-2V8h2v2ZM8 8H4V6h4v2Zm12 0h-4V6h4v2Zm-4-2H8V4h8v2Z')
export const PixelFileEmpty = pixelIcon('M16 4h-2v4h4V6h2v16H4V2h12v2ZM6 20h12V10h-6V4H6v16ZM18 6h-2V4h2v2Z')
// Empty-file outline with a plus in the lower corner, like the folder-plus icon (web PixelFilePlus).
export const PixelFilePlus = pixelIcon('M4 2h12v2H4zM4 4h2v16H4zM4 20h10v2H4zM18 6h2v8h-2zM12 4h2v4h-2zM12 8h8v2h-8zM16 4h2v2h-2zM20 18h2v2h-2v2h-2v-2h-2v-2h2v-2h2v2Z')
// Framed picture with a mountain, the cover the web draws for images.
export const PixelImage = pixelIcon('M8 20h6v-2h2v2h4v2H4v-2h2v-2h2v2Zm-4 0H2V4h2v16Zm18 0h-2v-4h-2v-2h2V4h2v16Zm-12-2H8v-2h2v2Zm4 0h-2v-2h2v2Zm-2-2h-2v-2h2v2Zm4 0h-2v-2h2v2Zm2-2h-2v-2h2v2Zm-8-2H8v-2h2v2Zm-2-2H6V8h2v2Zm4 0h-2V8h2v2Zm-2-2H8V6h2v2Zm10-4H4V2h16v2Z')
export const PixelCamera = pixelIcon('M18 5h4v16H2V5h4V3h12v2ZM8 7H4v12h16V7h-4V5H8v2Zm6 9h-4v-2h4v2Zm-4-2H8v-4h2v4Zm6 0h-2v-4h2v4Zm-2-4h-4V8h4v2Z')
export const PixelFolder = pixelIcon('M20 20H4v-2h16v2ZM4 18H2V6h2v12Zm18 0h-2V8h2v10ZM20 8H10V6H4V4h8v2h8v2Z')
export const PixelFolderPlus = pixelIcon('M20 18h2v2h-2v2h-2v-2h-2v-2h2v-2h2v2Zm-6 2H4v-2h10v2ZM4 18H2V6h2v12Zm18-4h-2V8h2v6ZM12 6h8v2H10V6H4V4h8v2Z')
export const PixelTrash = pixelIcon('M18 22H6V20H18V22ZM9 6H15V4H17V6H22V8H20V20H18V8H6V20H4V8H2V6H7V4H9V6ZM15 4H9V2H15V4Z')

// Rail, Home and toolbar icons from the web app.
export const PixelSearch = pixelIcon('M22 22h-2v-2h2v2Zm-2-2h-2v-2h2v2Zm-6-2H6v-2h8v2Zm4 0h-2v-2h2v2ZM6 16H4v-2h2v2Zm10 0h-2v-2h2v2ZM4 14H2V6h2v8Zm14 0h-2V6h2v8ZM6 6H4V4h2v2Zm10 0h-2V4h2v2Zm-2-2H6V2h8v2Z')
export const PixelUpload = pixelIcon('M19 21H5v-2h14v2ZM5 19H3v-4h2v4Zm16 0h-2v-4h2v4ZM13 5h2v2h2v2h-4v8h-2V9H7V7h2V5h2V3h2v2Z')
export const PixelPlus = pixelIcon('M13 11h7v2h-7v7h-2v-7H4v-2h7V4h2v7Z')
export const PixelCloud = pixelIcon('M10 4h6v2h-6zM8 6h2v2H8zm8 0h2v2h-2zM4 8h4v2H4zm14 0h2v2h-2zM2 10h2v2H2zm6 0h2v2H8zm10 0h4v2h-4zM0 12h2v6H0zm16 0h2v2h-2zm6 0h2v2h-2zm-2 4h2v2h-2zM2 18h14v2H2zm16 0h6v2h-6zm2 2h2v2h-2z')
export const PixelGrid = pixelIcon('M20 4h-7v7h7V4h2v16h-2v-7h-7v7h7v2H4v-2h7v-7H4v7H2V4h2v7h7V4H4V2h16v2Z')
export const PixelList = pixelIcon('M10 5h12v2H10zm0 4h8v2h-8zm0 4h12v2H10zm0 4h8v2h-8zM4 7v2h2V7H4Zm4 4H2V5h6v6Zm-6 2h6v2H2zm0 4h6v2H2zm0 0v-2h2v2zm4 0v-2h2v2z')
export const PixelPanel = pixelIcon('M20 4v16h2V4zM2 11v2h16v-2zm12 2v2h2v-2zm-2 2v2h2v-2zm-2 2v2h2v-2zm4-8v2h2V9zm-2-2v2h2V7zm-2-2v2h2V5z')
export const PixelGear = pixelIcon('M10 22H6v-2h4v2Zm-4-2H4v-2H2v-2h2v-2h2v6Zm6-4h10v2H12v2h-2v-6h2v2Zm-2-2H6v-2h4v2Zm8-2h-4v-2h4v2Zm-6-4H2V6h10V4h2v6h-2V8Zm8-2h2v2h-2v2h-2V4h2v2Zm-2-2h-4V2h4v2Z')

// House outline for the sidebar's "Início".
export const PixelHome = pixelIcon('M10 20h4v-6h2v6h4v2H4v-2h4v-6h2v6Zm-6 0H2V10h2v10Zm18 0h-2V10h2v10Zm-8-6h-4v-2h4v2Zm-8-4H4V8h2v2Zm14 0h-2V8h2v2ZM8 8H6V6h2v2Zm10 0h-2V6h2v2Zm-8-2H8V4h2v2Zm6 0h-2V4h2v2Zm-2-2h-4V2h4v2Z')

// Funnel for the Home's provider filter.
export const PixelFilter = pixelIcon('M11 20h2v2H9V12h2v8Zm4 0h-2v-8h2v8Zm-6-8H7v-2h2v2Zm8 0h-2v-2h2v2ZM7 10H5V8h2v2Zm12 0h-2V8h2v2Zm2-2h-2V4H5v4H3V2h18v6Z')

// Framed bust for the account button in the Home header.
export const PixelUser = pixelIcon('M8 20h8v-2h2v2h2v2H4v-2h2v-2h2v2Zm-4 0H2V4h2v16Zm18 0h-2V4h2v16Zm-6-2H8v-2h8v2Zm-2-4h-4v-2h4v2Zm-4-2H8V8h2v4Zm6 0h-2V8h2v4Zm-2-4h-4V6h4v2Zm6-4H4V2h16v2Z')

// Mobile-only shapes drawn on the same grid.
export const PixelMore = pixelIcon('M10 4h4v4h-4zM10 10h4v4h-4zM10 16h4v4h-4z')
export const PixelBack = pixelIcon('M14 4h2v2h-2zM12 6h2v2h-2zM10 8h2v2h-2zM8 10h2v4H8zM10 14h2v2h-2zM12 16h2v2h-2zM14 18h2v2h-2z')
export const PixelCheck = pixelIcon('M20 6h2v2h-2zM18 8h2v2h-2zM16 10h2v2h-2zM14 12h2v2h-2zM12 14h2v2h-2zM10 16h2v2h-2zM8 14h2v2H8zM6 12h2v2H6zM4 10h2v2H4z')

// The Bridgit logo (apps/web BrandMark).
export const BrandMark = pixelIcon('M22 20H2v-2h20v2ZM2 18H0v-6h2v6Zm22 0h-2v-6h2v6Zm-6-6v2h-2v-2h2ZM4 12H2v-2h2v2Zm6 0H8v-2h2v2Zm10-2h2v2h-4V8h2v2ZM8 10H4V8h4v2Zm2-2H8V6h2v2Zm8 0h-2V6h2v2Zm-2-2h-6V4h6v2Z')
