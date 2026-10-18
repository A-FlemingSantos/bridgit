// Pixel-art glyphs for Settings, on the 24-unit grid of the rest of the app (the same drawings as
// the mobile app's PixelIcons). They take the text color and any size.
function Glyph({ path, size = 24, className }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      fill="currentColor"
      viewBox="0 0 24 24"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} />
    </svg>
  )
}

const glyph = (path) => {
  function PixelGlyph(props) {
    return <Glyph path={path} {...props} />
  }
  return PixelGlyph
}

export const PixelUser = glyph('M8 20h8v-2h2v2h2v2H4v-2h2v-2h2v2Zm-4 0H2V4h2v16Zm18 0h-2V4h2v16Zm-6-2H8v-2h8v2Zm-2-4h-4v-2h4v2Zm-4-2H8V8h2v4Zm6 0h-2V8h2v4Zm-2-4h-4V6h4v2Zm6-4H4V2h16v2Z')
export const PixelKey = glyph('M11 18H3V16H11V18ZM23 15H21V18H17V16H19V13H21V11H11V8H13V9H23V15ZM3 16H1V8H3V16ZM17 16H15V15H13V16H11V13H17V16ZM9 14H5V10H9V14ZM11 8H3V6H11V8Z')
export const PixelBrand = glyph('M22 20H2v-2h20v2ZM2 18H0v-6h2v6Zm22 0h-2v-6h2v6Zm-6-6v2h-2v-2h2ZM4 12H2v-2h2v2Zm6 0H8v-2h2v2Zm10-2h2v2h-4V8h2v2ZM8 10H4V8h4v2Zm2-2H8V6h2v2Zm8 0h-2V6h2v2Zm-2-2h-6V4h6v2Z')
export const PixelTrash = glyph('M18 22H6V20H18V22ZM9 6H15V4H17V6H22V8H20V20H18V8H6V20H4V8H2V6H7V4H9V6ZM15 4H9V2H15V4Z')
export const PixelUnlink = glyph('M13 20h-2V4h2v16Zm-4-2H4v-2h5v2Zm11 0h-5v-2h5v2ZM4 16H2V8h2v8Zm18 0h-2V8h2v8ZM9 8H4V6h5v2Zm11 0h-5V6h5v2Z')
export const PixelGithub = glyph('M5 2h4v2H7v2H5V2Zm0 10H3V6h2v6Zm2 2H5v-2h2v2Zm2 2v-2H7v2H3v-2H1v2h2v2h4v4h2v-4h2v-2H9Zm0 0v2H7v-2h2Zm6-12v2H9V4h6Zm4 2h-2V4h-2V2h4v4Zm0 6V6h2v6h-2Zm-2 2v-2h2v2h-2Zm-2 2v-2h2v2h-2Zm0 2h-2v-2h2v2Zm0 0h2v4h-2v-4Z')
export const PixelLinkedin = glyph('M7 22H1V8h6v14Zm12-12h-8v10h2v-8h4v2h-2v8H9V8h10v2Zm4 12h-6v-8h2v6h2v-8h2v10ZM3 20h2V10H3v10Zm18-8h-2v-2h2v2ZM5 7H3V5h2v2ZM3 5H1V3h2v2Zm4 0H5V3h2v2ZM5 3H3V1h2v2Z')
export const PixelX = glyph('M6 20H4v-2h2v2Zm14-2h2v2h-6v-2h2v-2h2v2ZM8 18H6v-2h2v2Zm8 0h-2v-2h2v2Zm-6-2H8v-2h2v2Zm4 0h-2v-2h2v2Zm4 0h-2v-2h2v2Zm-6-2h-2v-2h2v2Zm4 0h-2v-2h2v2Zm-6-2H8v-2h2v2Zm4 0h-2v-2h2v2Zm-6-2H6V8h2v2Zm4 0h-2V8h2v2Zm4 0h-2V8h2v2ZM8 6H6v2H4V6H2V4h6v2Zm2 2H8V6h2v2Zm8 0h-2V6h2v2Zm2-2h-2V4h2v2Z')
