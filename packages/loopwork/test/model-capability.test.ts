import { describe, test, expect, beforeEach } from 'bun:test'
import { ModelCapabilityRegistryImpl, createModelCapabilityRegistry } from '../src/core/model-capability-registry'
import { CapabilityBasedModelSelectorImpl, createCapabilityModelSelector } from '../src/core/capability-model-selector'
import type { CapabilityModelConfig } from '../src/contracts/model-capability'

describe('ModelCapabilityRegistry', () => {
  let registry: ModelCapabilityRegistryImpl

  beforeEach(() => {
    registry = new ModelCapabilityRegistryImpl()
  })

  test('loads default capabilities', () => {
    expect(registry.getCapability('high')).toBeDefined()
    expect(registry.getCapability('medium')).toBeDefined()
    expect(registry.getCapability('low')).toBeDefined()
  })

  test('loads default roles', () => {
    expect(registry.getRole('architect')).toBeDefined()
    expect(registry.getRole('engineer')).toBeDefined()
  })

  test('finds capabilities for task category', () => {
    const caps = registry.findCapabilitiesForTask('architecture')
    expect(caps.some(c => c.level === 'high')).toBe(true)
    expect(caps.some(c => c.level === 'low')).toBe(false)
  })

  test('finds roles for capability level', () => {
    const roles = registry.findRolesForCapability('high')
    expect(roles.some(r => r.type === 'architect')).toBe(true)
    expect(roles.some(r => r.type === 'engineer')).toBe(true)

    const lowRoles = registry.findRolesForCapability('low')
    expect(lowRoles.some(r => r.type === 'architect')).toBe(false)
    expect(lowRoles.some(r => r.type === 'junior-engineer')).toBe(true)
  })
})

describe('CapabilityBasedModelSelector', () => {
  let selector: CapabilityBasedModelSelectorImpl
  let registry: ModelCapabilityRegistryImpl

  const highModel: CapabilityModelConfig = {
    name: 'opus',
    cli: 'claude',
    model: 'opus',
    capability: 'high',
    costWeight: 100,
    primaryRole: 'architect',
    enabled: true
  }

  const mediumModel: CapabilityModelConfig = {
    name: 'sonnet',
    cli: 'claude',
    model: 'sonnet',
    capability: 'medium',
    costWeight: 30,
    primaryRole: 'engineer',
    enabled: true
  }

  const lowModel: CapabilityModelConfig = {
    name: 'haiku',
    cli: 'claude',
    model: 'haiku',
    capability: 'low',
    costWeight: 10,
    primaryRole: 'junior-engineer',
    enabled: true
  }

  beforeEach(() => {
    registry = new ModelCapabilityRegistryImpl()
    selector = new CapabilityBasedModelSelectorImpl(registry)
    selector.registerModel(highModel)
    selector.registerModel(mediumModel)
    selector.registerModel(lowModel)
  })

  test('filters by minimum capability', () => {
    const result = selector.getNextByCapability({ minCapability: 'medium' })
    expect(result.matched).toBe(true)
    expect(result.model?.name).toBe('sonnet')
    
    expect(result.alternatives?.some(m => m.name === 'opus')).toBe(true)
    expect(result.alternatives?.some(m => m.name === 'haiku')).toBe(false)
  })

  test('filters by required role', () => {
    const result = selector.getNextByRole('architect')
    expect(result.matched).toBe(true)
    expect(result.model?.name).toBe('opus')
  })

  test('filters by task category', () => {
    const result = selector.getNextForTaskCategory('architecture')
    expect(result.matched).toBe(true)
    expect(result.model?.capability).toBe('high')
    expect(result.model?.name).toBe('opus')
  })

  test('prefers lower cost when capable', () => {
    const result = selector.getNextForTaskCategory('testing')
    expect(result.matched).toBe(true)
    expect(result.model?.name).toBe('haiku')
  })

  test('returns no match if criteria not met', () => {
    const result = selector.getNextByCapability({ minCapability: 'high', maxCostWeight: 50 })
    expect(result.matched).toBe(false)
  })

  test('respects preferred capability', () => {
    const result = selector.getNextByCapability({ 
      minCapability: 'medium', 
      preferredCapability: 'high' 
    })
    
    expect(result.matched).toBe(true)
    expect(result.model?.name).toBe('opus')
  })
})
