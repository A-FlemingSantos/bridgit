import { useEffect, useRef, useState } from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Minus, Plus } from 'lucide-react-native'
import AccountAvatar from '../components/AccountAvatar'
import ActionDialog, { NameField, Notice, SheetButton } from '../components/ActionDialog'
import ActionSheet from '../components/ActionSheet'
import AddAccountMenu from '../components/AddAccountMenu'
import BrowseHeader from '../components/BrowseHeader'
import BrowserMark from '../components/BrowserMark'
import {
  BrandMark,
  PixelGithub,
  PixelKey,
  PixelLinkedin,
  PixelTrash,
  PixelUnlink,
  PixelUser,
  PixelX,
} from '../components/PixelIcons'
import { useSession } from '../auth/SessionContext'
import { needsReconnect } from '../hub/format'
import { useConnections } from '../hub/hooks'
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
  // Rows may come as lists (one per account), so they are flattened before the separators go in.
  const rows = [children].flat(Infinity).filter(Boolean)
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

function Row({
  leading = null,
  title,
  subtitle = null,
  subtitleAlert = false,
  badge = null,
  trailing = null,
  danger = false,
  disabled = false,
  onPress = null,
}) {
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
          <AppText
            numberOfLines={1}
            style={[styles.rowSubtitle, { color: subtitleAlert ? theme.colors.danger : theme.colors.mute }]}
          >
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {trailing}
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
        pressed ? { backgroundColor: theme.colors.press } : null,
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
      style={({ pressed }) => [styles.pill, { backgroundColor: pressed ? theme.colors.press : theme.colors.raise }]}
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

function accountLabel(connection) {
  return connection.account?.email ?? connection.account?.name ?? connection.providerName
}

// The icon-only "sair" at the end of an account row.
function SignOutButton({ label, onPress }) {
  const { theme } = useMobileTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.rowAction, pressed ? { backgroundColor: theme.colors.press } : null]}
    >
      <Minus size={18} strokeWidth={1.8} color={theme.colors.mute} />
    </Pressable>
  )
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
  const { connections } = useConnections()
  const [dialog, setDialog] = useState(null)
  const [form, setForm] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const addButton = useRef(null)
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

  const confirmSignOut = (connection) => setDialog({
    type: 'confirm',
    title: `Sair de ${accountLabel(connection)}?`,
    message: 'Os arquivos continuam no provedor. Recentes, atalhos e links desta conta saem do Bridgit.',
    confirmLabel: 'Sair',
    danger: true,
    onSubmit: orThrow(() => settings.disconnectAccount(connection.connectionId)),
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
          <SectionTitle>Minhas contas</SectionTitle>
          {settings.providersStatus === 'error' && connections.length === 0 ? (
            <Pressable accessibilityRole="button" onPress={settings.reloadProviders}>
              <AppText style={[styles.rowSubtitle, { color: theme.colors.mute }]}>
                Não foi possível carregar as contas. Toque para tentar de novo.
              </AppText>
            </Pressable>
          ) : (
            <Card>
              {connections.map((connection) => {
                const label = accountLabel(connection)
                const expired = needsReconnect(connection)
                return (
                  <Row
                    key={connection.connectionId}
                    leading={<AccountAvatar connection={connection} size={28} ring={theme.colors.raise} />}
                    title={label}
                    subtitle={expired ? 'Acesso expirado · toque para reconectar' : null}
                    subtitleAlert={expired}
                    onPress={expired
                      ? async () => say(await settings.connectProvider(connection.providerId))
                      : null}
                    trailing={<SignOutButton label={`Sair de ${label}`} onPress={() => confirmSignOut(connection)} />}
                  />
                )
              })}
              <View key="add" ref={addButton} collapsable={false}>
                <Row
                  leading={<Plus size={20} strokeWidth={1.7} color={theme.colors.mute} />}
                  title="Adicionar conta"
                  onPress={() => setAddOpen(true)}
                />
              </View>
            </Card>
          )}
          <AddAccountMenu
            open={addOpen}
            anchor={addButton}
            onClose={() => setAddOpen(false)}
            providers={settings.providers}
            onSelect={async (providerId) => {
              setAddOpen(false)
              say(await settings.connectProvider(providerId, { addAccount: true }))
            }}
          />
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
                  style={({ pressed }) => [styles.social, pressed ? { backgroundColor: theme.colors.press } : null]}
                >
                  <Icon size={24} color={theme.colors.ink} />
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>

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
  rowAction: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
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
