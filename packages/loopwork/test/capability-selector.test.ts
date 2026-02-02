import { describe, test, expect, beforeEach } from 'bun:test'
import { createCapabilityModelSelector } from '../src/core/capability-model-selector'
import type { CapabilityBasedModelSelector, CapabilityModelConfig } from '../src/contracts/model-capability'

describe('CapabilityBasedModelSelector', () => {
  let selector: CapabilityBasedModelSelector
  
  const models: CapabilityModelConfig[] = [
    { 
      name: 'opus', 
      cli: 'claude', 
      model: 'opus', 
      capability: 'high',
      costWeight: 100,
      primaryRole: 'architect',
      maxComplexity: 10
    },
    { 
      name: 'sonnet', 
      cli: 'claude', 
      model: 'sonnet', 
      capability: 'medium',
      costWeight: 30,
      primaryRole: 'tech-lead',
      secondaryRoles: ['senior-engineer'],
      maxComplexity: 6
    },
    { 
      name: 'haiku', 
      cli: 'claude', 
      model: 'haiku', 
      capability: 'low',
      costWeight: 10,
      primaryRole: 'junior-engineer',
      maxComplexity: 3
    }
  ]

  beforeEach(() => {
    selector = createCapabilityModelSelector()
    models.forEach(m => selector.registerModel(m))
  })

  test('selects model by minimum capability', () => {
    const result = selector.getNextByCapability({ minCapability: 'medium' })
    expect(result.matched).toBe(true)
    expect(result.model.capability).toBe('medium')
    expect(result.model.name).toBe('sonnet')
  })

  test('selects model by role', () => {
    const result = selector.getNextByRole('architect')
    expect(result.matched).toBe(true)
    expect(result.model.name).toBe('opus')
  })

  test('selects model by task complexity', () => {
    const result = selector.getNextByCapability({ taskComplexity: 8 })
    expect(result.matched).toBe(true)
    expect(result.model.name).toBe('opus')
  })

  test('filters out models exceeding max cost', () => {
    const result = selector.getNextByCapability({ 
      minCapability: 'medium',
      maxCostWeight: 50
    })
    expect(result.matched).toBe(true)
    expect(result.model.name).toBe('sonnet')
  })

  test('returns fallback if no match found', () => {
    const result = selector.getNextByCapability({ minCapability: 'high', maxCostWeight: 10 })
    expect(result.matched).toBe(false)
  })
})
