import { useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import BrowseHeader from '../components/BrowseHeader'
import ProviderMark from '../components/ProviderMark'
import {
  Button,
  ConfirmButton,
  ConfirmPanel,
  Divider,
  Hint,
  PrefRow,
  Section,
  Switch,
  TextField,
} from '../components/SettingsParts'
import { useSession } from '../auth/SessionContext'
import { ABOUT, useSettings } from '../settings/useSettings'
import AppText from '../theme/AppText'
import { useMobileTheme } from '../theme/ThemeProvider'

function AccountSection({ settings, onLogout }) {
  const { theme } = useMobileTheme()
  const [draft, setDraft] = useState(settings.username)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const initial = settings.username.slice(0, 1).toUpperCase()

  return (
    <Section title="Conta">
      <View style={styles.identity}>
        <View style={[styles.avatar, { backgroundColor: theme.colors.ink }]}>
          <AppText weight="500" style={[styles.avatarInitial, { color: theme.colors.paper }]}>{initial}</AppText>
        </View>
        <View style={styles.rowBody}>
          <AppText weight="500" numberOfLines={1} style={styles.name}>{settings.username}</AppText>
          <Hint>Usuário do hub</Hint>
        </View>
        <Button label="Sair" onPress={onLogout} />
      </View>
      <TextField
        label="Usuário"
        value={draft}
        onChangeText={(value) => {
          setDraft(value)
          setSaved(false)
        }}
        autoComplete="username"
      />
      {error ? <Hint>{error}</Hint> : null}
      <Button
        label={saved ? 'Salvo' : 'Salvar'}
        variant="solid"
        onPress={async () => {
          const message = await settings.saveUsername(draft)
          setError(message)
          setSaved(!message)
        }}
      />
    </Section>
  )
}

function ProvidersSection({ settings }) {
  const [asking, setAsking] = useState(null)
  const [error, setError] = useState('')

  return (
    <Section title="Provedores">
      {error ? <Hint>{error}</Hint> : null}
      {settings.providers.map((provider) => (
        <View key={provider.id} style={styles.providerBlock}>
          <View style={styles.providerRow}>
            <ProviderMark id={provider.id} size={22} />
            <View style={styles.rowBody}>
              <AppText weight="500" style={styles.rowTitle}>{provider.name}</AppText>
              <Hint>{provider.account ?? 'Não conectado'}</Hint>
            </View>
            {provider.account ? (
              <Button label="Desconectar" onPress={() => setAsking(provider.id)} />
            ) : (
              <Button
                label="Conectar"
                variant="solid"
                disabled={!provider.configured}
                onPress={async () => setError(await settings.connectProvider(provider.id))}
              />
            )}
          </View>
          {asking === provider.id && provider.account ? (
            <ConfirmPanel
              prompt={`Desconectar ${provider.name}? Os arquivos continuam no provedor.`}
              confirmLabel="Desconectar"
              onCancel={() => setAsking(null)}
              onConfirm={async () => {
                setAsking(null)
                setError(await settings.disconnectProvider(provider.id))
              }}
            />
          ) : null}
        </View>
      ))}
    </Section>
  )
}

function SyncSection({ settings }) {
  const connected = settings.providers.filter((provider) => provider.connected)

  return (
    <Section title="Sincronização">
      <Hint>Nada é espelhado por padrão. O hub só orquestra o que você ligar.</Hint>
      <PrefRow title="Avisar se a sincronização falhar" hint="Só para os itens que você marcou.">
        <Switch
          label="Avisar se a sincronização falhar"
          value={settings.notifyFail}
          onChange={settings.setNotifyFail}
        />
      </PrefRow>
      {connected.length === 0 ? <Hint>Conecte um provedor para acompanhar a sincronização.</Hint> : null}
      {connected.map((provider) => (
        <View key={provider.id} style={styles.fact}>
          <AppText style={styles.rowTitle}>{provider.name}</AppText>
          <Hint>{provider.sync}</Hint>
        </View>
      ))}
    </Section>
  )
}

function SecuritySection({ settings }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const others = settings.sessions.filter((session) => !session.current)

  async function submit() {
    const message = await settings.changePassword(current, next, confirm)
    setError(message)
    setSaved(!message)
    if (!message) {
      setCurrent('')
      setNext('')
      setConfirm('')
    }
  }

  return (
    <Section title="Segurança">
      <TextField label="Senha atual" value={current} onChangeText={setCurrent} secure autoComplete="password" />
      <TextField label="Nova senha" value={next} onChangeText={setNext} secure autoComplete="password-new" />
      <TextField label="Confirmar senha" value={confirm} onChangeText={setConfirm} secure autoComplete="password-new" />
      {error ? <Hint>{error}</Hint> : null}
      <Button label={saved ? 'Senha alterada' : 'Salvar senha'} variant="solid" onPress={submit} />

      <Divider />
      <AppText weight="500" style={styles.rowTitle}>Sessões</AppText>
      {settings.sessions.map((session) => (
        <View key={session.id} style={styles.fact}>
          <AppText style={styles.rowTitle}>{session.device}</AppText>
          <Hint>{session.detail}</Hint>
        </View>
      ))}
      <Button
        label={others.length === 0 ? 'Encerradas' : 'Encerrar outras sessões'}
        disabled={others.length === 0}
        onPress={async () => setError(await settings.revokeOtherSessions())}
      />

      <Divider />
      <AppText weight="500" style={styles.rowTitle}>Excluir conta</AppText>
      <Hint>Apaga seus dados do hub. Os arquivos continuam nos provedores.</Hint>
      <ConfirmButton
        label="Excluir conta"
        prompt="Excluir a conta de vez? Isso não pode ser desfeito."
        confirmLabel="Excluir"
        variant="danger"
        onConfirm={async () => setError(await settings.deleteAccount())}
      />
    </Section>
  )
}

function AboutSection() {
  return (
    <Section title="Sobre">
      <View style={styles.fact}>
        <AppText weight="500" style={styles.rowTitle}>Bridgit</AppText>
        <Hint>Versão {ABOUT.version}</Hint>
      </View>
      <View style={styles.fact}>
        <AppText weight="500" style={styles.rowTitle}>O que guarda</AppText>
        <Hint>{ABOUT.stores}</Hint>
      </View>
      <View style={styles.fact}>
        <AppText weight="500" style={styles.rowTitle}>Provedores</AppText>
        <Hint>{ABOUT.providers}</Hint>
      </View>
      <View style={styles.actions}>
        <Button label="Privacidade" onPress={() => {}} />
        <Button label="Termos" onPress={() => {}} />
      </View>
    </Section>
  )
}

export default function SettingsScreen({ navigation }) {
  const { theme } = useMobileTheme()
  const insets = useSafeAreaInsets()
  const settings = useSettings()

  const { logout } = useSession()

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.paper }]}>
      <BrowseHeader title="Ajustes" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <AccountSection settings={settings} onLogout={logout} />
        <ProvidersSection settings={settings} />
        <SyncSection settings={settings} />
        <SecuritySection settings={settings} />
        <AboutSection />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 8,
    gap: 32,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 15,
  },
  name: {
    fontSize: 15,
    letterSpacing: -0.45,
  },
  providerBlock: {
    gap: 10,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 13,
    letterSpacing: -0.39,
  },
  fact: {
    gap: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
})
