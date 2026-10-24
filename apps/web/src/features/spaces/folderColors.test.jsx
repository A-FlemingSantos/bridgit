import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_FOLDER_COLOR, findFolderColor, migrateLegacyColors, useFolderColors } from './folderColors.js'

// Colors are cached per user at module level, so each test gets its own user.
const session = vi.hoisted(() => ({ userId: 'user-colors-0' }))

vi.mock('../../shared/auth/SessionContext.jsx', () => ({
  useSession: () => ({ user: { id: session.userId } }),
}))

const connections = [
  { connectionId: 'od-1', provider: 'onedrive' },
  { connectionId: 'od-2', provider: 'onedrive' },
  { connectionId: 'gd-1', provider: 'google-drive' },
]

vi.mock('../../shared/hub/index.js', () => ({
  useConnections: () => ({ connections }),
}))

let tests = 0
const storageKey = () => `bridgit.folderColors.${session.userId}`

describe('folderColors', () => {
  beforeEach(() => {
    window.localStorage.clear()
    tests += 1
    session.userId = `user-colors-${tests}`
  })

  it('usa carvão quando a cor é desconhecida', () => {
    expect(findFolderColor('nao-existe')).toBe(DEFAULT_FOLDER_COLOR)
  })

  it('guarda a cor da pasta por conta e volta ao padrão', () => {
    const { result } = renderHook(() => useFolderColors())
    expect(result.current.colorOf('od-1', 'f1').id).toBe('carbon')

    act(() => result.current.setColor('od-1', 'f1', 'sage'))
    expect(result.current.colorOf('od-1', 'f1').id).toBe('sage')
    expect(JSON.parse(window.localStorage.getItem(storageKey()))).toEqual({ 'od-1:f1': 'sage' })

    act(() => result.current.setColor('od-1', 'f1', 'carbon'))
    expect(result.current.colorOf('od-1', 'f1').id).toBe('carbon')
    expect(JSON.parse(window.localStorage.getItem(storageKey()))).toEqual({})
  })

  it('duas contas do mesmo provedor não dividem a cor de uma pasta de mesmo ref', () => {
    const { result } = renderHook(() => useFolderColors())

    act(() => result.current.setColor('od-1', 'f1', 'sage'))

    expect(result.current.colorOf('od-1', 'f1').id).toBe('sage')
    expect(result.current.colorOf('od-2', 'f1').id).toBe('carbon')
  })

  it('lê a cor antiga por provedor só na conta mais antiga e escreve na chave nova', () => {
    window.localStorage.setItem(storageKey(), JSON.stringify({ 'onedrive:f1': 'plum' }))
    const { result } = renderHook(() => useFolderColors())

    expect(result.current.colorOf('od-1', 'f1').id).toBe('plum')
    expect(result.current.colorOf('od-2', 'f1').id).toBe('carbon')
    expect(result.current.colorOf('gd-1', 'f1').id).toBe('carbon')

    act(() => result.current.setColor('od-1', 'f1', 'sage'))
    expect(result.current.colorOf('od-1', 'f1').id).toBe('sage')
    expect(JSON.parse(window.localStorage.getItem(storageKey()))).toEqual({ 'onedrive:f1': 'plum', 'od-1:f1': 'sage' })

    act(() => result.current.setColor('od-1', 'f1', 'carbon'))
    expect(result.current.colorOf('od-1', 'f1').id).toBe('carbon')
    expect(JSON.parse(window.localStorage.getItem(storageKey()))).toEqual({})
  })
})

describe('migrateLegacyColors', () => {
  const oldestOf = (provider) => ({ onedrive: 'od-1', 'google-drive': 'gd-1' })[provider] ?? null

  it('moves provider keys to the oldest account and keeps account keys that already exist', () => {
    const colors = { 'onedrive:a': 'sage', 'onedrive:b': 'clay', 'od-1:b': 'plum', 'gd-9:c': 'moss' }

    expect(migrateLegacyColors(colors, oldestOf)).toEqual({ 'od-1:a': 'sage', 'od-1:b': 'plum', 'gd-9:c': 'moss' })
  })

  it('leaves the colors of a provider without accounts for later, and returns null when nothing moves', () => {
    expect(migrateLegacyColors({ 'dropbox:a': 'sage' }, oldestOf)).toBeNull()
    expect(migrateLegacyColors({ 'od-1:a': 'sage' }, oldestOf)).toBeNull()
  })
})