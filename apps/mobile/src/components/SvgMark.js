import { useMemo, useRef } from 'react'
import { Image, Platform } from 'react-native'
import { SvgXml } from 'react-native-svg'
import { expandSvgStyles, inheritGradients, nextSvgPrefix, withSvgIds } from './svgMarkup'

// A full-color mark from raw SVG markup (provider, browser and device logos), square at `size`.
// Native renders it with react-native-svg after giving its ids a per-instance prefix; the web
// draws it as an image, which keeps gradients and filters intact.
export default function SvgMark({ source, size }) {
  const prefix = useRef(nextSvgPrefix()).current
  const xml = useMemo(() => {
    if (!source) return null
    return withSvgIds(inheritGradients(expandSvgStyles(source)), prefix)
  }, [prefix, source])

  if (!source) return null

  if (Platform.OS === 'web') {
    const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    )
  }

  if (!xml) return null
  return <SvgXml xml={xml} width={size} height={size} />
}
