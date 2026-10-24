import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import useContentAutosave from './useContentAutosave.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function setup(save, text = { current: 'a' }) {
  const hook = renderHook(() =>
    useContentAutosave({
      enabled: true,
      baseRevision: 'r1',
      fileName: 'a.py',
      mimeType: 'text/x-python',
      encoding: { bom: false, eol: '\n' },
      getText: () => text.current,
      save,
    }),
  )
  return { ...hook, text }
}

async function textOf(call) {
  return await call[0].file.text()
}

describe('useContentAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('salva 1,5 s depois da última mudança e passa a nova revisão adiante', async () => {
    const save = vi.fn().mockResolvedValueOnce({ revision: 'r2' }).mockResolvedValueOnce({ revision: 'r3' })
    const { result, text } = setup(save)

    act(() => result.current.markChanged())
    expect(result.current.label).toBe('Salvando…')
    await act(async () => vi.advanceTimersByTime(1499))
    expect(save).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTime(1))

    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0].baseRevision).toBe('r1')
    expect(await textOf(save.mock.calls[0])).toBe('a')
    expect(result.current.state).toBe('saved')
    expect(result.current.label).toBe('Salvo')

    text.current = 'ab'
    act(() => result.current.markChanged())
    await act(async () => vi.advanceTimersByTime(1500))
    expect(save.mock.calls[1][0].baseRevision).toBe('r2')
  })

  it('salva na hora com flush', async () => {
    const save = vi.fn().mockResolvedValue({ revision: 'r2' })
    const { result } = setup(save)

    act(() => result.current.markChanged())
    await act(async () => result.current.flush())

    expect(save).toHaveBeenCalledTimes(1)
  })

  it('não sobrepõe salvamentos e manda o texto mais recente depois', async () => {
    const first = deferred()
    const save = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce({ revision: 'r3' })
    const { result, text } = setup(save)

    act(() => result.current.markChanged())
    act(() => void result.current.flush())
    text.current = 'abc'
    act(() => result.current.markChanged())
    act(() => void result.current.flush())
    expect(save).toHaveBeenCalledTimes(1)

    await act(async () => first.resolve({ revision: 'r2' }))

    expect(save).toHaveBeenCalledTimes(2)
    expect(await textOf(save.mock.calls[1])).toBe('abc')
    expect(save.mock.calls[1][0].baseRevision).toBe('r2')
  })

  it('repete a mesma tentativa quando o resultado é incerto', async () => {
    const save = vi.fn().mockRejectedValueOnce(Object.assign(new Error('rede'), { status: 503 })).mockResolvedValueOnce({ revision: 'r2' })
    const { result } = setup(save)

    act(() => result.current.markChanged())
    await act(async () => result.current.flush())
    expect(result.current.state).toBe('unsaved')

    await act(async () => vi.advanceTimersByTime(3000))

    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1][0].file).toBe(save.mock.calls[0][0].file)
    expect(result.current.state).toBe('saved')
  })

  it('para no conflito e só grava de novo ao sobrescrever', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('alterado'), { status: 409, code: 'ARQUIVO_ALTERADO' }))
      .mockResolvedValueOnce({ revision: 'r9' })
    const { result } = setup(save)

    act(() => result.current.markChanged())
    await act(async () => result.current.flush())
    expect(result.current.state).toBe('conflict')

    act(() => result.current.markChanged())
    await act(async () => vi.advanceTimersByTime(5000))
    expect(save).toHaveBeenCalledTimes(1)

    await act(async () => result.current.overwrite())
    expect(save.mock.calls[1][0].overwrite).toBe(true)
    expect(result.current.state).toBe('saved')
  })

  it('depois de uma recusa permanente, digitar não tenta de novo; só salvar de propósito', async () => {
    const refused = Object.assign(new Error('sem permissão'), { status: 403, code: 'SEM_PERMISSAO' })
    const save = vi.fn().mockRejectedValueOnce(refused).mockResolvedValueOnce({ revision: 'r2' })
    const { result } = setup(save)

    act(() => result.current.markChanged())
    await act(async () => vi.advanceTimersByTime(1500))
    expect(save).toHaveBeenCalledTimes(1)
    expect(result.current.state).toBe('unsaved')

    act(() => result.current.markChanged())
    await act(async () => vi.advanceTimersByTime(5000))
    expect(save).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBe('sem permissão')

    await act(async () => result.current.flush())
    expect(save).toHaveBeenCalledTimes(2)
    expect(result.current.state).toBe('saved')
  })

  it('deixa fechar sem mudanças e segura uma vez quando não consegue salvar', async () => {
    const save = vi.fn().mockRejectedValue(Object.assign(new Error('sem permissão'), { status: 403, code: 'SEM_PERMISSAO' }))
    const { result } = setup(save)

    await expect(result.current.flushForClose()).resolves.toBe(true)

    act(() => result.current.markChanged())
    let first
    await act(async () => {
      first = await result.current.flushForClose()
    })
    expect(first).toBe(false)
    expect(result.current.error).toBe('As alterações não foram salvas. Feche de novo para sair sem salvar.')

    await expect(result.current.flushForClose()).resolves.toBe(true)
  })
})
