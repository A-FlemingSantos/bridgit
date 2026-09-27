const easProjectId = process.env.EAS_PROJECT_ID?.trim()

export default {
  expo: {
    name: 'Bridgit',
    slug: 'bridgit-mobile',
    version: '1.0.0',
    orientation: 'portrait',
    scheme: 'bridgit',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    android: {
      package: 'com.bridgit.mobile',
      softwareKeyboardLayoutMode: 'pan',
      edgeToEdgeEnabled: true,
    },
    androidStatusBar: {
      backgroundColor: '#00000000',
      translucent: true,
    },
    androidNavigationBar: {
      backgroundColor: '#000000',
      barStyle: 'light-content',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.bridgit.mobile',
    },
    assetBundlePatterns: [
      '**/*',
    ],
    plugins: [
      'expo-dev-client',
    ],
    ...(easProjectId
      ? {
          extra: {
            eas: {
              projectId: easProjectId,
            },
          },
        }
      : {}),
  },
}
