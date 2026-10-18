import { useRef } from 'react'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { DEFAULT_FOLDER_COLOR } from '../hub/folderColors'
import { nextSvgPrefix } from './svgMarkup'

// `hex` scaled toward black: the web's color-mix(in srgb, base N%, #000).
function darken(hex, amount) {
  const value = hex.replace('#', '')
  const channels = [0, 2, 4].map((at) => Math.round(parseInt(value.slice(at, at + 2), 16) * amount))
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

// The web folder: a back tab peeking above a front panel, every shade from one base color.
export default function FolderMark({ width = 112, color = DEFAULT_FOLDER_COLOR.hex }) {
  const gradientId = useRef(`${nextSvgPrefix()}-folder`).current
  const height = Math.round(width * (82 / 112))
  const tabHeight = height * (20 / 82)
  const bodyTop = height * (8 / 82)

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} />
          <Stop offset="1" stopColor={darken(color, 0.64)} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={width * 0.46} height={tabHeight} rx={width * 0.05} fill={darken(color, 0.62)} />
      <Rect x={0} y={bodyTop} width={width} height={height - bodyTop} rx={width * 0.045} fill={`url(#${gradientId})`} />
      <Rect x={width * 0.04} y={bodyTop} width={width * 0.92} height={1} fill="#ffffff" fillOpacity={0.14} />
    </Svg>
  )
}
