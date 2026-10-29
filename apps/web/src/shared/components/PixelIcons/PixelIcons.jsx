// Pixel-art menu icons, drawn on a 24-unit grid with 2-unit cells so they stay
// crisp at 24px. Menus render `icon` as <Icon size strokeWidth />; these ignore
// both (a pixel icon only looks right at its native size) and use a negative
// margin so the 24px drawing keeps the 16px footprint the menu slot reserves.
// A `size` draws it smaller (12 keeps every cell on a whole pixel) and drops the negative margin.
function PixelIcon({ path, size = null }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size ?? 24}
      height={size ?? 24}
      fill="currentColor"
      viewBox="0 0 24 24"
      shapeRendering="crispEdges"
      style={{ display: 'block', margin: size ? 0 : -4 }}
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

export function PixelCopy() {
  return (
    <PixelIcon path="M20 22H8v-2h12v2ZM8 20H6v-2H4v-2h2V8h2v12Zm14 0h-2V8h2v12ZM4 16H2V4h2v12ZM18 6h2v2H8V6h8V4h2v2Zm-2-2H4V2h12v2Z" />
  )
}

export function PixelEye() {
  return (
    <PixelIcon path="M16 20H8v-2h8v2Zm-8-2H4v-2h4v2Zm12 0h-4v-2h4v2ZM4 16H2v-2h2v2Zm10-6h-2v2h2v-2h2v4h-2v2h-4v-2H8v-4h2V8h4v2Zm8 6h-2v-2h2v2ZM2 14H0v-4h2v4Zm22 0h-2v-4h2v4ZM4 10H2V8h2v2Zm18 0h-2V8h2v2ZM8 8H4V6h4v2Zm12 0h-4V6h4v2Zm-4-2H8V4h8v2Z" />
  )
}

export function PixelFileEmpty() {
  return (
    <PixelIcon path="M16 4h-2v4h4V6h2v16H4V2h12v2ZM6 20h12V10h-6V4H6v16ZM18 6h-2V4h2v2Z" />
  )
}

// Empty-file outline with a plus in the lower corner, like the folder-plus icon.
export function PixelFilePlus() {
  return (
    <PixelIcon path="M4 2h12v2H4zM4 4h2v16H4zM4 20h10v2H4zM18 6h2v8h-2zM12 4h2v4h-2zM12 8h8v2h-8zM16 4h2v2h-2zM20 18h2v2h-2v2h-2v-2h-2v-2h2v-2h2v2Z" />
  )
}

// The same plus the account rail uses for "Nova conta".
export function PixelPlus({ size = null }) {
  return <PixelIcon path="M13 11h7v2h-7v7h-2v-7H4v-2h7V4h2v7Z" size={size} />
}

export function PixelFolder() {
  return (
    <PixelIcon path="M20 20H4v-2h16v2ZM4 18H2V6h2v12Zm18 0h-2V8h2v10ZM20 8H10V6H4V4h8v2h8v2Z" />
  )
}

export function PixelFolderPlus() {
  return (
    <PixelIcon path="M20 18h2v2h-2v2h-2v-2h-2v-2h2v-2h2v2Zm-6 2H4v-2h10v2ZM4 18H2V6h2v12Zm18-4h-2V8h2v6ZM12 6h8v2H10V6H4V4h8v2Z" />
  )
}

export function PixelTrash() {
  return (
    <PixelIcon path="M18 22H6V20H18V22ZM9 6H15V4H17V6H22V8H20V20H18V8H6V20H4V8H2V6H7V4H9V6ZM15 4H9V2H15V4Z" />
  )
}

// Close "x" for dialogs and the settings panel. Unlike the menu icons above, it keeps its own size.
export function PixelClose({ size = 24 }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      fill="currentColor"
      viewBox="0 0 24 24"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block' }}
    >
      <path d="M7 19H5v-2h2v2Zm12 0h-2v-2h2v2ZM9 15v2H7v-2h2Zm8 2h-2v-2h2v2Zm-6-2H9v-2h2v2Zm4 0h-2v-2h2v2Zm-2-2h-2v-2h2v2Zm-2-2H9V9h2v2Zm4 0h-2V9h2v2ZM9 9H7V7h2v2Zm8 0h-2V7h2v2ZM7 7H5V5h2v2Zm12 0h-2V5h2v2Z" />
    </svg>
  )
}

// Floppy disk for "Salvar"; keeps its own size like PixelClose.
export function PixelSave({ size = 24 }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      fill="currentColor"
      viewBox="0 0 24 24"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block' }}
    >
      <path d="M20 22H4v-2h2v-6h2v6h8v-6h2v6h2v2ZM4 20H2V4h2v16Zm18 0h-2V6h2v14Zm-6-6H8v-2h8v2Zm-4-4H6V6h6v4Zm8-4h-2V4h2v2Zm-2-2H4V2h14v2Z" />
    </svg>
  )
}
