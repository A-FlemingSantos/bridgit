import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useMobileTheme } from '../theme/ThemeProvider'
import AuthScreen from '../screens/AuthScreen'
import FileScreen from '../screens/FileScreen'
import FolderScreen from '../screens/FolderScreen'
import HomeScreen from '../screens/HomeScreen'

const Stack = createNativeStackNavigator()

export default function RootNavigator() {
  const { theme } = useMobileTheme()

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.paper },
      }}
    >
      <Stack.Screen name="Auth" component={AuthScreen} />
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Folder" component={FolderScreen} />
      <Stack.Screen name="File" component={FileScreen} />
    </Stack.Navigator>
  )
}
