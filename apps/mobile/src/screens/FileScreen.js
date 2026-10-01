import { StyleSheet, useWindowDimensions, View } from 'react-native'
import BrowseHeader from '../components/BrowseHeader'
import CollapsingHeader from '../components/CollapsingHeader'
import FileSheet from '../components/FileSheet'
import Spinner from '../components/Spinner'
import { getFile } from '../data/mock'
import AppText from '../theme/AppText'
import { useMobileTheme } from '../theme/ThemeProvider'

export default function FileScreen({ navigation, route }) {
  const { theme } = useMobileTheme()
  const { height } = useWindowDimensions()
  const { fileRef } = route.params ?? {}
  const file = getFile(fileRef)
  const title = file?.name ?? 'Arquivo'

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.paper }]}>
      <CollapsingHeader
        header={<BrowseHeader title={title} onBack={() => navigation.goBack()} />}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.stage, { minHeight: height * 0.82 }]}>
        <FileSheet large />
        <Spinner />
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
