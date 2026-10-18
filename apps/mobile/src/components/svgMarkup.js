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

const GRADIENT = /<(linearGradient|radialGradient)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g
const INHERITED = ['gradientUnits', 'gradientTransform', 'spreadMethod']

function attrOf(attrs, name) {
  return attrs.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]
}

// react-native-svg ignores a gradient's href to another gradient, the way exported logos (Edge,
// Safari) share gradientUnits and stops. Copies what each gradient inherits into it, then drops
// the reference.
export function inheritGradients(xml) {
  const byId = new Map()
  for (const [, , attrs, body = ''] of xml.matchAll(GRADIENT)) {
    const id = attrOf(attrs, 'id')
    if (id) byId.set(id, { attrs, body })
  }

  function resolve(attrs, body, depth = 0) {
    const ref = attrs.match(/\s(?:xlink:)?href="#([^"]+)"/)
    const parent = ref && byId.get(ref[1])
    if (!parent || depth > 4) return { attrs, body }
    const base = resolve(parent.attrs, parent.body, depth + 1)
    let merged = attrs.replace(ref[0], '')
    for (const name of INHERITED) {
      const value = attrOf(base.attrs, name)
      if (value != null && attrOf(merged, name) == null) merged += ` ${name}="${value}"`
    }
    return { attrs: merged, body: /<stop\b/.test(body) ? body : base.body }
  }

  return xml.replace(GRADIENT, (_, tag, attrs, body = '') => {
    const resolved = resolve(attrs, body)
    return `<${tag}${resolved.attrs}>${resolved.body}</${tag}>`
  })
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
