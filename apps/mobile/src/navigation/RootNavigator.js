import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useSession } from '../auth/SessionContext'
import { useMobileTheme } from '../theme/ThemeProvider'
import AuthScreen from '../screens/AuthScreen'
import FileScreen from '../screens/FileScreen'
import FolderScreen from '../screens/FolderScreen'
import HomeScreen from '../screens/HomeScreen'
import SettingsScreen from '../screens/SettingsScreen'

const Stack = createNativeStackNavigator()

export default function RootNavigator() {
  const { theme } = useMobileTheme()
  const { status, session } = useSession()

  if (status === 'loading') return null

  // Screens swap with the session, so sign-in, sign-out and an expired token all land correctly.
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.paper },
      }}
    >
      {session ? (
        <>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Folder" component={FolderScreen} />
          <Stack.Screen name="File" component={FileScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
        </>
      ) : (
        <Stack.Screen name="Auth" component={AuthScreen} />
      )}
    </Stack.Navigator>
  )
}
