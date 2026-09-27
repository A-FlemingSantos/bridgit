import { describe, expect, it } from 'vitest'
import { STAGGER_LIMIT, STAGGER_MAX_DELAY, entryDelay } from './stagger.js'

describe('entryDelay', () => {
  it('retorna o atraso base para o primeiro item', () => {
    expect(entryDelay(0, 0.06, 0.04)).toBeCloseTo(0.06)
  })

  it('acumula até o limite do grupo inicial', () => {
    expect(entryDelay(11, 0.06, 0.04)).toBeLessThanOrEqual(STAGGER_MAX_DELAY)
    expect(STAGGER_LIMIT).toBe(12)
  })

  it('retorna nulo a partir do fim do grupo inicial', () => {
    expect(entryDelay(12)).toBeNull()
  })

  it('nunca atrasa itens tardios nem estoura o teto', () => {
    expect(entryDelay(199, 0.06, 0.04)).toBeNull()
    expect(entryDelay(11, 0.14, 0.03)).toBeLessThanOrEqual(STAGGER_MAX_DELAY)
  })
})
