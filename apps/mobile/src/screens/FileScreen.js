import { StyleSheet, useWindowDimensions, View } from 'react-native'
import BrowseHeader from '../components/BrowseHeader'
import CollapsingHeader from '../components/CollapsingHeader'
import FileSheet from '../components/FileSheet'
import FileViewer from '../components/FileViewer'
import Spinner from '../components/Spinner'
import { useFile } from '../hub/hooks'
import { useRouteConnection } from './routeConnection'
import { errorMessage } from '../api/errorMessage'
import AppText from '../theme/AppText'
import { useMobileTheme } from '../theme/ThemeProvider'

// The route names the account (connectionId); one that names only the provider means its oldest account.
export default function FileScreen({ navigation, route }) {
  const { connectionId: routeConnectionId = null, providerId = null, fileRef = null } = route.params ?? {}
  const { status, connectionId } = useRouteConnection({ connectionId: routeConnectionId, providerId })

  if (status === 'ready' && connectionId) {
    return <FileContent navigation={navigation} connectionId={connectionId} fileRef={fileRef} />
  }
  return (
    <FileFrame navigation={navigation} title="Arquivo">
      <FileSheet large />
      {status === 'missing'
        ? <AppText>Conecte esta conta em Ajustes.</AppText>
        : <Spinner />}
    </FileFrame>
  )
}

function FileFrame({ navigation, title, children }) {
  const { theme } = useMobileTheme()
  const { height } = useWindowDimensions()

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.paper }]}>
      <CollapsingHeader
        header={<BrowseHeader title={title} onBack={() => navigation.goBack()} />}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.stage, { minHeight: height * 0.82 }]}>
          {children}
          <AppText weight="500" style={styles.title}>
            {title}
          </AppText>
        </View>
      </CollapsingHeader>
    </View>
  )
}

function FileContent({ navigation, connectionId, fileRef }) {
  const { theme } = useMobileTheme()
  const { file, source, status, error } = useFile(connectionId, fileRef)
  const title = file?.name ?? 'Arquivo'

  return (
    <FileFrame navigation={navigation} title={title}>
      {status === 'ready' && file ? (
        <FileViewer connectionId={connectionId} file={file} source={source} />
      ) : (
        <>
          <FileSheet large />
          {status === 'error' ? (
            <AppText style={{ color: theme.colors.mute }}>
              {errorMessage(error, 'Não foi possível abrir o arquivo.')}
            </AppText>
          ) : <Spinner />}
        </>
      )}
    </FileFrame>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -1.54,
    textAlign: 'center',
  },
})
