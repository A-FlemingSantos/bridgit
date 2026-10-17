// Pixel-art menu icons, drawn on a 24-unit grid with 2-unit cells so they stay
// crisp at 24px. Menus render `icon` as <Icon size strokeWidth />; these ignore
// both (a pixel icon only looks right at its native size) and use a negative
// margin so the 24px drawing keeps the 16px footprint the menu slot reserves.
function PixelIcon({ path }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      fill="currentColor"
      viewBox="0 0 24 24"
      shapeRendering="crispEdges"
      style={{ display: 'block', margin: -4 }}
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  )
}

export function PixelBookmark() {
  return (
    <PixelIcon path="M6 2h12v2H6zM4 4h2v18H4zm14 0h2v18h-2zm-2 16h2v2h-2zm-2-2h2v2h-2zm-8 2h2v2H6zm2-2h2v2H8zm2-2h4v2h-4z" />
  )
}

export function PixelLink() {
  return (
    <PixelIcon path="M11 18H4v-2h7v2Zm9 0h-7v-2h7v2ZM4 16H2V8h2v8Zm18 0h-2V8h2v8Zm-5-3H7v-2h10v2Zm-6-5H4V6h7v2Zm9 0h-7V6h7v2Z" />
  )
}

export function PixelUnlink() {
  return (
    <PixelIcon path="M13 20h-2V4h2v16Zm-4-2H4v-2h5v2Zm11 0h-5v-2h5v2ZM4 16H2V8h2v8Zm18 0h-2V8h2v8ZM9 8H4V6h5v2Zm11 0h-5V6h5v2Z" />
  )
}

// Folder with a right arrow in its lower corner, the same way the "new folder"
// icon carries a plus: the folder's bottom and right edges stop short of it.
export function PixelFolderMove() {
  return (
    <PixelIcon path="M12 20H4v-2h8v2ZM4 18H2V6h2v12Zm18-4h-2V8h2v6ZM12 6h8v2H10V6H4V4h8v2ZM18 16h2v2h-2zM14 18h8v2h-8zM18 20h2v2h-2z" />
  )
}

export function PixelPencil() {
  return (
    <PixelIcon path="M4 16H6V18H8V20H10V22H2V14H4V16ZM12 20H10V18H12V20ZM14 18H12V16H14V18ZM10 16H8V14H10V16ZM16 16H14V14H16V16ZM6 14H4V12H6V14ZM12 14H10V12H12V14ZM18 14H16V12H18V14ZM8 12H6V10H8V12ZM14 12H12V10H14V12ZM20 12H18V10H20V12ZM10 10H8V8H10V10ZM18 10H16V8H18V10ZM22 10H20V8H22V10ZM12 8H10V6H12V8ZM16 8H14V6H16V8ZM20 8H18V6H20V8ZM14 6H12V4H14V6ZM18 6H16V4H18V6ZM16 4H14V2H16V4Z" />
  )
}

export function PixelBrush() {
  return (
    <PixelIcon path="M3 21h2v2H1v-4h2v2Zm6 0H5v-2h4v2Zm-4-2H3v-4h2v4Zm6 0H9v-2h2v2Zm2-2h-2v-2h2v2Zm-6-2H5v-2h2v2Zm8 0h-2v-2h2v2Zm4 0h-2v-2h2v2ZM9 13H7v-2h2v2Zm8 0h-2v-2h2v2Zm4 0h-2v-2h2v2Zm-10-2H9V9h2v2Zm4 0h-2V9h2v2Zm4 0h-2V9h2v2Zm-6-2h-2V7h2v2Zm8 0h-2V7h2v2ZM11 7H9V5h2v2Zm4 0h-2V5h2v2Zm8 0h-2V5h2v2ZM13 5h-2V3h2v2Zm4 0h-2V3h2v2Zm4 0h-2V3h2v2Zm-2-2h-2V1h2v2Z" />
  )
}

export function PixelDownload() {
  return (
    <PixelIcon path="M19 21H5v-2h14v2ZM5 19H3v-4h2v4Zm16 0h-2v-4h2v4Zm-8-8h4v2h-2v2h-2v2h-2v-2H9v-2H7v-2h4V3h2v8Z" />
  )
}

export function PixelOpen() {
  return (
    <PixelIcon path="M2 3h9v2H2zM0 19h11v2H0zM13 3h9v2h-9zm0 16h11v2H13zM11 5h2v18h-2zM0 5h2v14H0zm22 0h2v14h-2zm-7 2h5v2h-5zm0 4h5v2h-5zm0 4h2v2h-2z" />
  )
}

export function PixelTrash() {
  return (
    <PixelIcon path="M18 22H6V20H18V22ZM9 6H15V4H17V6H22V8H20V20H18V8H6V20H4V8H2V6H7V4H9V6ZM15 4H9V2H15V4Z" />
  )
}
