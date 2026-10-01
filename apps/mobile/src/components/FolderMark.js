import { useMemo, useRef } from 'react'
import { SvgXml } from 'react-native-svg'
import { folder } from '../assets/marks'
import { useMobileTheme } from '../theme/ThemeProvider'
import { nextSvgPrefix, tintSvg, withSvgIds } from './svgMarkup'

export default function FolderMark({ size = 48 }) {
  const { theme } = useMobileTheme()
  const prefix = useRef(nextSvgPrefix()).current
  const xml = useMemo(
    () => tintSvg(withSvgIds(folder, prefix), theme.colors.ink),
    [prefix, theme.colors.ink],
  )
  return <SvgXml xml={xml} width={size} height={size} />
}
