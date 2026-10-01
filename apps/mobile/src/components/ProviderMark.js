import { useMemo, useRef } from 'react'
import { Image, Platform } from 'react-native'
import { SvgXml } from 'react-native-svg'
import { dropbox, googleDrive, onedrive } from '../assets/marks'
import { expandSvgStyles, nextSvgPrefix, withSvgIds } from './svgMarkup'

const MARKS = {
  onedrive,
  'google-drive': googleDrive,
  dropbox,
}

export default function ProviderMark({ id, size = 16 }) {
  const source = MARKS[id]
  const prefix = useRef(nextSvgPrefix()).current
  const xml = useMemo(() => {
    if (!source) return null
    return withSvgIds(expandSvgStyles(source), prefix)
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
