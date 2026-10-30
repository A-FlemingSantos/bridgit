import { useEffect, useMemo, useState } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import { useSession } from '../auth/SessionContext'
import AppText from '../theme/AppText'
import { useMobileTheme } from '../theme/ThemeProvider'
import { accountInitials } from './accountDisplay'
import ProviderMark from './ProviderMark'
import { useAccountAvatarFile } from './useAccountAvatarFile'

// The photo of a connected account, round, with the provider's mark in its bottom-right corner.
// The photo is downloaded with the session (the API answers 404 when the account has none) and shown
// from a local file; while it is missing or fails to load, the initials sit on a neutral tile.
// `connection` is a row from useConnections(); `ring` is the color behind the avatar, so the badge's
// outline blends into it; `fill` is the initials tile, one step above that layer.
export default function AccountAvatar({ connection, size = 32, badge = true, ring = null, fill = null }) {
  const { theme } = useMobileTheme()
  const { token } = useSession()
  const connectionId = connection?.connectionId ?? null
  const generation = connection?.generation
  const fileUri = useAccountAvatarFile(connectionId, generation, token)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [fileUri])

  const source = useMemo(() => (fileUri ? { uri: fileUri } : null), [fileUri])

  const initials = accountInitials({
    name: connection?.account?.name,
    email: connection?.account?.email,
    providerName: connection?.providerName,
  })
  const markSize = Math.max(12, Math.round(size * 0.46))
  const ringColor = ring ?? theme.colors.wash
  const ringWidth = 2

  return (
    <View style={{ width: size, height: size }}>
      <View style={[styles.tile, { width: size, height: size, borderRadius: size / 2, backgroundColor: fill ?? theme.colors.raise }]}>
        {source && !failed ? (
          <Image
            accessibilityIgnoresInvertColors
            source={source}
            resizeMode="cover"
            onError={() => setFailed(true)}
            style={{ width: size, height: size }}
          />
        ) : (
          <AppText weight="500" style={[styles.initials, { color: theme.colors.soft, fontSize: Math.round(size * 0.4) }]}>
            {initials}
          </AppText>
        )}
      </View>
      {badge && connection?.providerId ? (
        <View
          style={[
            styles.badge,
            {
              width: markSize + ringWidth * 2,
              height: markSize + ringWidth * 2,
              borderRadius: (markSize + ringWidth * 2) / 2,
              backgroundColor: ringColor,
              right: -ringWidth - 1,
              bottom: -ringWidth - 1,
            },
          ]}
        >
          <ProviderMark id={connection.providerId} size={markSize} />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  tile: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    letterSpacing: 0,
  },
  badge: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
