const easProjectId = process.env.EAS_PROJECT_ID?.trim()

export default {
  expo: {
    name: 'Bridgit',
    slug: 'bridgit-mobile',
    version: '1.0.0',
    orientation: 'portrait',
    scheme: 'bridgit',
    userInterfaceStyle: 'automatic',
    // The Bridgit logo in ink on paper, like the launch screen.
    icon: './assets/icon.png',
    newArchEnabled: true,
    android: {
      package: 'com.bridgit.mobile',
      // Logo kept inside the launcher mask's safe zone; the monochrome copy feeds themed icons.
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        monochromeImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
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
        // Launch screen: the Bridgit logo centered on the app's paper, light and dark.
        'expo-splash-screen',
        {
          image: './assets/splash-logo.png',
          imageWidth: 96,
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
          dark: {
            image: './assets/splash-logo-dark.png',
            backgroundColor: '#161616',
          },
        },
      ],
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
