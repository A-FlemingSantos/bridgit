// A browser that shrinks a large preview several times in one step draws it grainy. Shrinking it here
// in halves, with high-quality smoothing, down to the tile's size in device pixels keeps it sharp.
export async function fitThumbnail(blob, { width, height, fit, scale = 1 }) {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined' || !width || !height) return blob
  let bitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch {
    return blob
  }
  try {
    const widthRatio = width / bitmap.width
    const heightRatio = height / bitmap.height
    const ratio = (fit === 'cover' ? Math.max(widthRatio, heightRatio) : Math.min(widthRatio, heightRatio)) * scale
    const targetWidth = Math.max(1, Math.round(bitmap.width * ratio))
    const targetHeight = Math.max(1, Math.round(bitmap.height * ratio))
    if (targetWidth >= bitmap.width) return blob

    let source = bitmap
    let canvas = null
    let currentWidth = bitmap.width
    let currentHeight = bitmap.height
    while (currentWidth > targetWidth) {
      const nextWidth = Math.max(targetWidth, Math.floor(currentWidth / 2))
      const nextHeight = Math.max(targetHeight, Math.floor(currentHeight / 2))
      canvas = document.createElement('canvas')
      canvas.width = nextWidth
      canvas.height = nextHeight
      const context = canvas.getContext('2d')
      if (!context) return blob
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(source, 0, 0, nextWidth, nextHeight)
      source = canvas
      currentWidth = nextWidth
      currentHeight = nextHeight
    }
    const resized = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.92))
    return resized ?? blob
  } catch {
    return blob
  } finally {
    bitmap.close?.()
  }
}
