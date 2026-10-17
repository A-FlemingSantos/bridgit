import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_FOLDER_COLOR, findFolderColor, useFolderColors } from './folderColors.js'

vi.mock('../../shared/auth/SessionContext.jsx', () => ({
  useSession: () => ({ user: { id: 'user-colors' } }),
}))

describe('folderColors', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('usa carvão quando a cor é desconhecida', () => {
    expect(findFolderColor('nao-existe')).toBe(DEFAULT_FOLDER_COLOR)
  })

  it('guarda a cor da pasta por usuário e volta ao padrão', () => {
    const { result } = renderHook(() => useFolderColors())
    expect(result.current.colorOf('onedrive', 'f1').id).toBe('carbon')

    act(() => result.current.setColor('onedrive', 'f1', 'sage'))
    expect(result.current.colorOf('onedrive', 'f1').id).toBe('sage')
    expect(JSON.parse(window.localStorage.getItem('bridgit.folderColors.user-colors'))).toEqual({
      'onedrive:f1': 'sage',
    })

    act(() => result.current.setColor('onedrive', 'f1', 'carbon'))
    expect(result.current.colorOf('onedrive', 'f1').id).toBe('carbon')
    expect(JSON.parse(window.localStorage.getItem('bridgit.folderColors.user-colors'))).toEqual({})
  })
})
