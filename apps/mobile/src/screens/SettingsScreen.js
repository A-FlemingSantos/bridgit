import { useEffect, useRef, useState } from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ActionDialog, { NameField, Notice, SheetButton } from '../components/ActionDialog'
import ActionSheet, { SheetHeader } from '../components/ActionSheet'
import BrowseHeader from '../components/BrowseHeader'
import BrowserMark from '../components/BrowserMark'
import ProviderMark from '../components/ProviderMark'
import {
  BrandMark,
  PixelGithub,
  PixelKey,
  PixelLink,
  PixelLinkedin,
  PixelTrash,
  PixelUnlink,
  PixelUser,
  PixelX,
} from '../components/PixelIcons'
import { useSession } from '../auth/SessionContext'
import { ABOUT, useSettings } from '../settings/useSettings'
import AppText from '../theme/AppText'
import { useMobileTheme } from '../theme/ThemeProvider'

const NOTICE_MS = 3200

// Only GitHub has a link for now; LinkedIn and X are placeholders.
const SOCIALS = [
  { id: 'github', label: 'GitHub', icon: PixelGithub, url: 'https://github.com/A-FlemingSantos/bridgit' },
  { id: 'linkedin', label: 'LinkedIn', icon: PixelLinkedin, url: null },
  { id: 'x', label: 'X', icon: PixelX, url: null },
]

// A message at the top of the screen for a few seconds (failed connects, revokes, saves).
function useFlash() {
  const [message, setMessage] = useState('')
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  function say(text) {
    clearTimeout(timer.current)
    setMessage(text)
    if (text) timer.current = setTimeout(() => setMessage(''), NOTICE_MS)
  }
  return [message, say]
}

function SectionTitle({ children }) {
  return <AppText weight="500" style={styles.sectionTitle}>{children}</AppText>
}

// Rounded group of rows on the raised surface, like the bottom sheet lists.
function Card({ children }) {
  const { theme } = useMobileTheme()
  const rows = (Array.isArray(children) ? children : [children]).filter(Boolean)
  return (
    <View style={[styles.card, { backgroundColor: theme.colors.raise }]}>
      {rows.map((row, index) => (
        <View key={row.key ?? index}>
          {index > 0 ? <View style={[styles.separator, { backgroundColor: theme.colors.line }]} /> : null}
          {row}
        </View>
      ))}
    </View>
  )
}

function Row({ leading = null, title, subtitle = null, badge = null, danger = false, disabled = false, onPress = null }) {
  const { theme } = useMobileTheme()
  const content = (
    <>
      {leading ? <View style={styles.rowLeading}>{leading}</View> : null}
      <View style={styles.rowBody}>
        <View style={styles.rowTitleLine}>
          <AppText numberOfLines={1} style={[styles.rowTitle, { color: danger ? theme.colors.danger : theme.colors.ink }]}>
            {title}
          </AppText>
          {badge ? (
            <View style={[styles.badge, { backgroundColor: theme.colors.wash }]}>
              <AppText style={[styles.badgeLabel, { color: theme.colors.soft }]}>{badge}</AppText>
            </View>
          ) : null}
        </View>
        {subtitle ? (
          <AppText numberOfLines={1} style={[styles.rowSubtitle, { color: theme.colors.mute }]}>{subtitle}</AppText>
        ) : null}
      </View>
    </>
  )
  if (!onPress) return <View style={styles.row}>{content}</View>
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed ? { backgroundColor: theme.colors.line } : null,
        disabled ? styles.disabled : null,
      ]}
    >
      {content}
    </Pressable>
  )
}

function Pill({ label, onPress }) {
  const { theme } = useMobileTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, { backgroundColor: pressed ? theme.colors.line : theme.colors.raise }]}
    >
      <AppText weight="500" style={[styles.pillLabel, { color: theme.colors.ink }]}>{label}</AppText>
    </Pressable>
  )
}

// The account, centered: the Home's account icon with the username under it.
function AccountHero({ username, onEdit, onLogout }) {
  const { theme } = useMobileTheme()
  return (
    <View style={styles.hero}>
      <PixelUser size={72} color={theme.colors.ink} />
      <AppText weight="500" numberOfLines={1} style={styles.heroName}>{username}</AppText>
      <AppText style={[styles.heroHint, { color: theme.colors.mute }]}>Conta Bridgit</AppText>
      <View style={styles.heroActions}>
        <Pill label="Editar usuário" onPress={onEdit} />
        <Pill label="Sair" onPress={onLogout} />
      </View>
    </View>
  )
}

function providerStatus(provider) {
  if (provider.needsReconnect) return 'Expirado'
  if (provider.connected) return 'Conectado'
  if (!provider.configured) return 'Indisponível'
  return 'Conectar'
}

// One card per provider across a single strip, drawn like the Home's action tiles.
function ProviderCard({ provider, onPress }) {
  const { theme } = useMobileTheme()
  const status = providerStatus(provider)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${provider.name}: ${status}`}
      onPress={onPress}
      style={({ pressed }) => [styles.providerCard, { backgroundColor: pressed ? theme.colors.line : theme.colors.raise }]}
    >
      <ProviderMark id={provider.id} size={32} />
      <AppText weight="500" numberOfLines={1} style={[styles.providerName, { color: theme.colors.ink }]}>
        {provider.name}
      </AppText>
      <AppText
        numberOfLines={1}
        style={[styles.providerStatus, { color: provider.needsReconnect ? theme.colors.danger : theme.colors.mute }]}
      >
        {status}
      </AppText>
    </Pressable>
  )
}

function providerItems(provider, { connect, disconnect }) {
  if (provider.needsReconnect) {
    return [
      { id: 'reconnect', label: 'Reconectar', icon: PixelLink, onSelect: connect },
      { id: 'disconnect', label: 'Desconectar', icon: PixelUnlink, danger: true, onSelect: disconnect },
    ]
  }
  if (provider.connected) {
    return [{ id: 'disconnect', label: 'Desconectar', icon: PixelUnlink, danger: true, onSelect: disconnect }]
  }
  return [{
    id: 'connect',
    label: 'Conectar',
    hint: provider.configured ? null : 'Não configurado neste servidor',
    icon: PixelLink,
    disabled: !provider.configured,
    onSelect: connect,
  }]
}

// A form in a bottom sheet: title, fields, then Cancelar and the confirm button.
function FormSheet({ open, onClose, title, message = null, confirmLabel, danger = false, onSubmit, children }) {
  const { theme } = useMobileTheme()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setBusy(false)
      setError('')
    }
  }, [open])

  async function submit() {
    if (busy) return
    setBusy(true)
    const failure = await onSubmit()
    setBusy(false)
    if (failure) setError(failure)
    else onClose()
  }

  return (
    <ActionSheet open={open} onClose={busy ? () => {} : onClose}>
      <View style={styles.form}>
        <View style={styles.formText}>
          <AppText weight="500" style={styles.formTitle}>{title}</AppText>
          {message ? <AppText style={[styles.formMessage, { color: theme.colors.mute }]}>{message}</AppText> : null}
        </View>
        {children}
        {error ? <AppText style={[styles.formMessage, { color: theme.colors.danger }]}>{error}</AppText> : null}
        <View style={styles.formActions}>
          <SheetButton label="Cancelar" onPress={onClose} disabled={busy} />
          <SheetButton label={busy ? 'Aguarde…' : confirmLabel} variant={danger ? 'danger' : 'solid'} disabled={busy} onPress={submit} />
        </View>
      </View>
    </ActionSheet>
  )
}

function PasswordSheet({ open, onClose, changePassword, onDone }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')

  useEffect(() => {
    if (!open) return
    setCurrent('')
    setNext('')
    setConfirm('')
  }, [open])

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title="Alterar senha"
      confirmLabel="Salvar"
      onSubmit={async () => {
        const failure = await changePassword(current, next, confirm)
        if (!failure) onDone()
        return failure
      }}
    >
      <NameField label="Senha atual" value={current} onChangeText={setCurrent} secure autoComplete="password" />
      <NameField label="Nova senha" value={next} onChangeText={setNext} secure autoComplete="password-new" />
      <NameField label="Confirmar senha" value={confirm} onChangeText={setConfirm} secure autoComplete="password-new" />
    </FormSheet>
  )
}

// Deleting the account asks for the password: an open session alone is not enough.
function DeleteSheet({ open, onClose, deleteAccount }) {
  const [password, setPassword] = useState('')

  useEffect(() => {
    if (open) setPassword('')
  }, [open])

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title="Excluir conta"
      message="Apaga seus dados do Bridgit de vez. Os arquivos continuam nos provedores."
      confirmLabel="Excluir"
      danger
      onSubmit={() => deleteAccount(password)}
    >
      <NameField label="Sua senha" value={password} onChangeText={setPassword} secure autoComplete="password" />
    </FormSheet>
  )
}

export default function SettingsScreen({ navigation }) {
  const { theme } = useMobileTheme()
  const insets = useSafeAreaInsets()
  const settings = useSettings()
  const { logout } = useSession()
  const [notice, say] = useFlash()
  const [dialog, setDialog] = useState(null)
  const [providerId, setProviderId] = useState(null)
  const [form, setForm] = useState(null)
  // The provider sheet keeps drawing the last provider while it slides away.
  const lastProvider = useRef(null)
  const openProvider = settings.providers.find((provider) => provider.id === providerId) ?? null
  if (openProvider) lastProvider.current = openProvider
  const shownProvider = openProvider ?? lastProvider.current
  const others = settings.sessions.filter((session) => !session.current)

  // Fails with the hook's message so the dialog sheet shows it and stays open.
  const orThrow = (run) => async (value) => {
    const failure = await run(value)
    if (failure) throw new Error(failure)
  }

  const editUsername = () => setDialog({
    type: 'name',
    title: 'Editar usuário',
    label: 'Usuário',
    initial: settings.username,
    confirmLabel: 'Salvar',
    onSubmit: orThrow(settings.saveUsername),
  })

  const confirmDisconnect = (provider) => setDialog({
    type: 'confirm',
    title: `Desconectar ${provider.name}?`,
    message: 'Os arquivos continuam no provedor. Recentes, atalhos e links dele saem do Bridgit.',
    confirmLabel: 'Desconectar',
    danger: true,
    onSubmit: orThrow(() => settings.disconnectProvider(provider.id)),
  })

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.paper }]}>
      <BrowseHeader title="Ajustes" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <AccountHero username={settings.username} onEdit={editUsername} onLogout={logout} />

        <View style={styles.section}>
          <SectionTitle>Provedores</SectionTitle>
          {settings.providers.length ? (
            <View style={styles.providers}>
              {settings.providers.map((provider) => (
                <ProviderCard key={provider.id} provider={provider} onPress={() => setProviderId(provider.id)} />
              ))}
            </View>
          ) : settings.providersStatus === 'error' ? (
            <Pressable accessibilityRole="button" onPress={settings.reloadProviders}>
              <AppText style={[styles.rowSubtitle, { color: theme.colors.mute }]}>
                Não foi possível carregar os provedores. Toque para tentar de novo.
              </AppText>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.section}>
          <SectionTitle>Segurança</SectionTitle>
          <Card>
            <Row
              key="password"
              leading={<PixelKey size={20} color={theme.colors.mute} />}
              title="Alterar senha"
              onPress={() => setForm('password')}
            />
            <Row
              key="delete"
              leading={<PixelTrash size={20} color={theme.colors.danger} />}
              title="Excluir conta"
              danger
              onPress={() => setForm('delete')}
            />
          </Card>
        </View>

        <View style={styles.section}>
          <SectionTitle>Sessões</SectionTitle>
          {settings.sessions.length ? (
            <Card>
              {settings.sessions.map((session) => (
                <Row
                  key={session.id}
                  leading={<BrowserMark browser={session.browser} device={session.device} size={28} />}
                  title={session.browser}
                  subtitle={[session.device, session.detail].filter(Boolean).join(' · ')}
                  badge={session.current ? 'Esta sessão' : null}
                />
              ))}
            </Card>
          ) : null}
          <Card>
            <Row
              leading={<PixelUnlink size={20} color={theme.colors.mute} />}
              title={others.length ? 'Encerrar outras sessões' : 'Nenhuma outra sessão aberta'}
              disabled={!others.length}
              onPress={async () => {
                const failure = await settings.revokeOtherSessions()
                say(failure || 'Outras sessões encerradas.')
              }}
            />
          </Card>
        </View>

        <View style={styles.section}>
          <SectionTitle>Sobre</SectionTitle>
          <View style={[styles.about, { backgroundColor: theme.colors.raise }]}>
            <BrandMark size={32} color={theme.colors.ink} />
            <AppText weight="500" style={styles.aboutName}>Bridgit</AppText>
            <AppText style={[styles.aboutLine, { color: theme.colors.mute }]}>Versão {ABOUT.version}</AppText>
            <View style={styles.socials}>
              {SOCIALS.map(({ id, label, icon: Icon, url }) => (
                <Pressable
                  key={id}
                  accessibilityRole={url ? 'link' : 'image'}
                  accessibilityLabel={label}
                  disabled={!url}
                  onPress={() => Linking.openURL(url).catch(() => {})}
                  hitSlop={6}
                  style={({ pressed }) => [styles.social, pressed ? { backgroundColor: theme.colors.line } : null]}
                >
                  <Icon size={24} color={theme.colors.ink} />
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>

      <ActionSheet
        open={Boolean(openProvider)}
        onClose={() => setProviderId(null)}
        header={shownProvider ? (
          <SheetHeader
            centered
            leading={<ProviderMark id={shownProvider.id} size={48} />}
            title={shownProvider.name}
            subtitle={shownProvider.needsReconnect ? 'Acesso expirado' : shownProvider.account ?? 'Não conectado'}
          />
        ) : null}
        items={shownProvider ? providerItems(shownProvider, {
          connect: async () => say(await settings.connectProvider(shownProvider.id)),
          disconnect: () => confirmDisconnect(shownProvider),
        }) : []}
      />

      <PasswordSheet
        open={form === 'password'}
        onClose={() => setForm(null)}
        changePassword={settings.changePassword}
        onDone={() => say('Senha alterada.')}
      />
      <DeleteSheet open={form === 'delete'} onClose={() => setForm(null)} deleteAccount={settings.deleteAccount} />

      <ActionDialog dialog={dialog} onClose={() => setDialog(null)} />
      <Notice message={notice} />
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
  hero: {
    alignItems: 'center',
    paddingTop: 8,
  },
  heroName: {
    marginTop: 14,
    maxWidth: '100%',
    fontSize: 22,
    letterSpacing: -0.66,
  },
  heroHint: {
    marginTop: 2,
    fontSize: 13,
    letterSpacing: -0.13,
  },
  heroActions: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    minHeight: 38,
    paddingHorizontal: 18,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillLabel: {
    fontSize: 13.5,
    letterSpacing: -0.27,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 17,
    letterSpacing: -0.51,
  },
  providers: {
    flexDirection: 'row',
    gap: 8,
  },
  providerCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 112,
    paddingVertical: 16,
    paddingHorizontal: 6,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  providerName: {
    marginTop: 8,
    fontSize: 13.5,
    letterSpacing: -0.27,
  },
  providerStatus: {
    fontSize: 11.5,
    letterSpacing: -0.1,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 52,
  },
  row: {
    minHeight: 56,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowLeading: {
    width: 28,
    alignItems: 'center',
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowTitle: {
    flexShrink: 1,
    fontSize: 15,
    letterSpacing: -0.3,
  },
  rowSubtitle: {
    fontSize: 12.5,
    letterSpacing: -0.12,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgeLabel: {
    fontSize: 11,
    letterSpacing: -0.1,
  },
  disabled: {
    opacity: 0.45,
  },
  about: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderRadius: 16,
  },
  aboutName: {
    marginTop: 12,
    fontSize: 16,
    letterSpacing: -0.4,
  },
  aboutLine: {
    marginTop: 2,
    fontSize: 12.5,
  },
  socials: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 8,
  },
  social: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  form: {
    gap: 20,
    paddingHorizontal: 4,
  },
  formText: {
    gap: 6,
  },
  formTitle: {
    fontSize: 18,
    letterSpacing: -0.54,
  },
  formMessage: {
    fontSize: 13.5,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  formActions: {
    flexDirection: 'row',
    gap: 8,
  },
})
