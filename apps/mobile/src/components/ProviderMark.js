import Svg, { Path } from 'react-native-svg'
import { googleDrive, onedrive } from '../assets/marks'
import { useMobileTheme } from '../theme/ThemeProvider'
import SvgMark from './SvgMark'

const MARKS = {
  onedrive,
  'google-drive': googleDrive,
}

// Dropbox's own box glyph, without its blue tile, in the theme's ink.
const DROPBOX_BOX = 'M43.7 32 23.404 44.75 43.701 57.5 64 44.75 84.3 57.5l20.298-12.75L84.299 32 64.002 44.75 43.7 32Zm0 51L23.404 70.25 43.701 57.5 64 70.25 43.702 83Zm20.302-12.75L84.299 57.5l20.298 12.75L84.299 83 64.002 70.25Zm0 29.75L43.7 87.25 64 74.5l20.3 12.75L64.002 100Z'

function DropboxMark({ size }) {
  const { theme } = useMobileTheme()
  return (
    <Svg width={size} height={size} viewBox="23.4 32 81.2 68">
      <Path d={DROPBOX_BOX} fill={theme.colors.ink} />
    </Svg>
  )
}

export default function ProviderMark({ id, size = 16 }) {
  if (id === 'dropbox') return <DropboxMark size={size} />
  return <SvgMark source={MARKS[id]} size={size} />
}
