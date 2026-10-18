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
      // Edge to edge, "resize" leaves the window still and hands the keyboard height to the app
      // (sheets and screens make room themselves); "pan" would shift the whole window, background
      // screen included.
      softwareKeyboardLayoutMode: 'resize',
      edgeToEdgeEnabled: true,
    },
    androidStatusBar: {
      backgroundColor: '#00000000',
      translucent: true,
    },
    // Transparent from launch: the app draws edge to edge under the navigation bar.
    androidNavigationBar: {
      backgroundColor: '#00000000',
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
      [
        'expo-image-picker',
        {
          photosPermission: 'O Bridgit acessa suas fotos para enviá-las à sua nuvem.',
          cameraPermission: 'O Bridgit usa a câmera para enviar fotos e vídeos à sua nuvem.',
          microphonePermission: 'O Bridgit usa o microfone para gravar o áudio dos vídeos.',
        },
      ],
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
