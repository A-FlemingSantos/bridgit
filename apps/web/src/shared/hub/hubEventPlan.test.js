import { describe, expect, it } from 'vitest'
import { mergeRefreshPlans, planEventRefresh } from './hubEventPlan.js'

describe('planEventRefresh', () => {
  it('atalhos, links e recentes só recarregam a Home', () => {
    expect(planEventRefresh({ type: 'hub_entries', payload: { entry: 'recent', ref: 'a' } })).toEqual({ home: true })
  })

  it('uma pasta alterada recarrega só ela, inclusive a raiz', () => {
    expect(planEventRefresh({ type: 'catalog', payload: { parentRef: 'p-1' } })).toEqual({ folders: ['p-1'] })
    expect(planEventRefresh({ type: 'catalog', payload: { parentRef: null } })).toEqual({ folders: [null] })
  })

  it('um item sem pasta conhecida recarrega as pastas que o mostram e a Home', () => {
    expect(planEventRefresh({ type: 'catalog', payload: { ref: 'f-1' } })).toEqual({ containing: ['f-1'], home: true })
  })

  it('o fim de uma sincronização recarrega o provedor inteiro', () => {
    expect(planEventRefresh({ type: 'catalog', payload: { refresh: true } })).toEqual({ all: true })
  })

  it('junta os planos de vários eventos', () => {
    let plan = mergeRefreshPlans(null, { folders: ['a'] })
    plan = mergeRefreshPlans(plan, { containing: ['f'], home: true })
    plan = mergeRefreshPlans(plan, { folders: ['a', 'b'] })

    expect(plan.all).toBe(false)
    expect(plan.home).toBe(true)
    expect([...plan.folders]).toEqual(['a', 'b'])
    expect([...plan.containing]).toEqual(['f'])
  })
})
