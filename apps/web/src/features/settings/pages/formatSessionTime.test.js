import { describe, expect, it } from 'vitest'
import { formatSessionTime } from './formatSessionTime.js'

describe('formatSessionTime', () => {
  const now = new Date('2026-09-23T19:09:00.000Z')

  it('mostra só o horário no mesmo dia', () => {
    expect(formatSessionTime('2026-09-23T19:04:00.000Z', now)).toMatch(/\d{2}:\d{2}/)
    expect(formatSessionTime('2026-09-23T19:04:00.000Z', now)).not.toMatch(/\d{2}\/\d{2}/)
  })

  it('inclui a data quando o dia é outro', () => {
    expect(formatSessionTime('2026-09-22T12:00:00.000Z', now)).toMatch(/\d{2}\/\d{2}, \d{2}:\d{2}/)
  })
})
