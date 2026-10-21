// Filling the tile crops what does not fit. A preview far from the tile's shape, such as the one-line strip
// OneDrive draws for a short text file, would come out as a magnified slice; past this many times the tile's
// proportion it is laid out as a page instead: as wide as the tile, from the top, on its own background.
const MAX_COVER_STRETCH = 2

function stretchOf(imageWidth, imageHeight, boxWidth, boxHeight) {
  const stretch = (imageWidth / imageHeight) / (boxWidth / boxHeight)
  return Math.max(stretch, 1 / stretch)
}

// A browser that shrinks a large image several times in one step draws it grainy, so it is shrunk here in halves.
function shrink(source, sourceWidth, sourceHeight, targetWidth, targetHeight) {
  let current = source
  let currentWidth = sourceWidth
  let currentHeight = sourceHeight
  do {
    const nextWidth = Math.max(targetWidth, Math.floor(currentWidth / 2))
    const nextHeight = Math.max(targetHeight, Math.floor(currentHeight / 2))
    const canvas = document.createElement('canvas')
    canvas.width = nextWidth
    canvas.height = nextHeight
    const context = canvas.getContext('2d')
    if (!context) return null
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(current, 0, 0, nextWidth, nextHeight)
    current = canvas
    currentWidth = nextWidth
    currentHeight = nextHeight
  } while (currentWidth > targetWidth)
  return current
}

// The colour of the image's bottom-left corner, which is the paper of a rendered page.
function paperOf(bitmap) {
  const probe = document.createElement('canvas')
  probe.width = 1
  probe.height = 1
  const context = probe.getContext('2d')
  if (!context) return '#fff'
  context.drawImage(bitmap, 0, bitmap.height - 1, 1, 1, 0, 0, 1, 1)
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data
  return `rgb(${red}, ${green}, ${blue})`
}

function page(bitmap, width, height) {
  const scaledHeight = Math.max(1, Math.round(bitmap.height * (width / bitmap.width)))
  const content = width < bitmap.width ? shrink(bitmap, bitmap.width, bitmap.height, width, scaledHeight) : bitmap
  if (!content) return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return null
  context.fillStyle = paperOf(bitmap)
  context.fillRect(0, 0, width, height)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(content, 0, 0, width, scaledHeight)
  return canvas
}

// Draws the preview at the tile's size in device pixels, so the browser never has to resize it again.
export async function fitThumbnail(blob, { width, height, fit, scale = 1 }) {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined' || !width || !height) return blob
  let bitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch {
    return blob
  }
  try {
    let canvas
    if (fit === 'cover' && stretchOf(bitmap.width, bitmap.height, width, height) > MAX_COVER_STRETCH) {
      canvas = page(bitmap, Math.round(width * scale), Math.round(height * scale))
    } else {
      const widthRatio = width / bitmap.width
      const heightRatio = height / bitmap.height
      const ratio = (fit === 'cover' ? Math.max(widthRatio, heightRatio) : Math.min(widthRatio, heightRatio)) * scale
      const targetWidth = Math.max(1, Math.round(bitmap.width * ratio))
      const targetHeight = Math.max(1, Math.round(bitmap.height * ratio))
      if (targetWidth >= bitmap.width) return blob
      canvas = shrink(bitmap, bitmap.width, bitmap.height, targetWidth, targetHeight)
    }
    if (!canvas) return blob
    const resized = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.92))
    return resized ?? blob
  } catch {
    return blob
  } finally {
    bitmap.close?.()
  }
}
