import { StyleSheet, useWindowDimensions, View } from 'react-native'
import BrowseHeader from '../components/BrowseHeader'
import CollapsingHeader from '../components/CollapsingHeader'
import FileSheet from '../components/FileSheet'
import FileViewer from '../components/FileViewer'
import Spinner from '../components/Spinner'
import { useFile } from '../hub/hooks'
import AppText from '../theme/AppText'
import { useMobileTheme } from '../theme/ThemeProvider'

export default function FileScreen({ navigation, route }) {
  const { theme } = useMobileTheme()
  const { height } = useWindowDimensions()
  const { providerId, fileRef } = route.params ?? {}
  const { file, source, status, error } = useFile(providerId, fileRef)
  const title = file?.name ?? 'Arquivo'

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.paper }]}>
      <CollapsingHeader
        header={<BrowseHeader title={title} onBack={() => navigation.goBack()} />}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.stage, { minHeight: height * 0.82 }]}>
        {status === 'ready' && file ? (
          <FileViewer providerId={providerId} file={file} source={source} />
        ) : (
          <>
            <FileSheet large />
            {status === 'error' ? (
              <AppText style={{ color: theme.colors.mute }}>
                {error?.message ?? 'Não foi possível abrir o arquivo.'}
              </AppText>
            ) : <Spinner />}
          </>
        )}
        <AppText weight="500" style={styles.title}>
          {title}
        </AppText>
        </View>
      </CollapsingHeader>
    </View>
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
