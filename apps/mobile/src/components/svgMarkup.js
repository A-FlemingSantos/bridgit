let sequence = 0

export function nextSvgPrefix() {
  sequence += 1
  return `mk${sequence}`
}

export function withSvgIds(xml, prefix) {
  return xml
    .replace(/\bid="([^"]+)"/g, (_, id) => `id="${prefix}-${id}"`)
    .replace(/\bhref="#([^"]+)"/g, (_, id) => `href="#${prefix}-${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${prefix}-${id})`)
}

export function tintSvg(xml, color) {
  return xml.replace(/currentColor/g, color)
}

function percentRgbToHex(value) {
  return value.replace(
    /rgb\(\s*([\d.]+)%\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/g,
    (_, red, green, blue) => {
      const hex = [red, green, blue]
        .map((channel) => Math.round((Number(channel) / 100) * 255).toString(16).padStart(2, '0'))
        .join('')
      return `#${hex}`
    },
  )
}

const PRESENTATION_ATTRS = new Set([
  'fill',
  'fill-rule',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stop-color',
  'stop-opacity',
])

export function expandSvgStyles(xml) {
  return xml.replace(/\sstyle="([^"]*)"/g, (_, style) => {
    const attrs = style
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const splitAt = part.indexOf(':')
        if (splitAt < 0) return ''
        const key = part.slice(0, splitAt).trim()
        if (!PRESENTATION_ATTRS.has(key)) return ''
        const value = percentRgbToHex(part.slice(splitAt + 1).trim())
        return `${key}="${value}"`
      })
      .filter(Boolean)
    return attrs.length ? ` ${attrs.join(' ')}` : ''
  })
}
