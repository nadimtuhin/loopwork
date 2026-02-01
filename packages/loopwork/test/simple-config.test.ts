/**
 * Tests for simplified configuration API
 */
import { describe, test, expect } from 'bun:test'
import {
  defineSimpleConfig,
  createPresetConfig,
  defineEasyConfig,
  Presets,
} from '../src/plugins/simple-config'
import type { SimpleConfigOptions } from '../src/plugins/simple-config'

describe('Simple Config API', () => {
  describe('defineSimpleConfig', () => {
    test('creates basic config with model shortcuts', () => {
      const config = defineSimpleConfig({
        models: ['claude-sonnet', 'gemini-flash'],
        parallel: 2,
      })

      expect(config.parallel).toBe(2)
      expect(config.maxIterations).toBe(50)
      expect(config.timeout).toBe(600)
      expect(config.backend).toEqual({
        type: 'json',
        tasksFile: '.specs/tasks/tasks.json',
      })
      expect(config.cliConfig).toBeDefined()
      expect(config.cliConfig?.models).toHaveLength(2)
    })

    test('creates config with string backend', () => {
      const config = defineSimpleConfig({
        models: ['claude-sonnet'],
        backend: 'custom/tasks.json',
      })

      expect(config.backend).toEqual({
        type: 'json',
        tasksFile: 'custom/tasks.json',
      })
    })

    test('creates config with object backend', () => {
      const config = defineSimpleConfig({
        models: ['claude-sonnet'],
        backend: {
          type: 'github',
          repo: 'owner/repo',
        },
      })

      expect(config.backend).toEqual({
        type: 'github',
        repo: 'owner/repo',
      })
    })

    test('creates config with fallback models', () => {
      const config = defineSimpleConfig({
        models: ['gemini-flash'],
        fallbackModels: ['claude-sonnet', 'claude-opus'],
      })

      expect(config.cliConfig?.models).toHaveLength(1)
      expect(config.cliConfig?.fallbackModels).toHaveLength(2)
    })

    test('parses model shortcuts correctly', () => {
      const config = defineSimpleConfig({
        models: ['fast', 'balanced', 'premium'],
      })

      expect(config.cliConfig?.models).toHaveLength(3)
      // 'fast' should map to gemini-flash
      expect(config.cliConfig?.models[0].cli).toBe('opencode')
      // 'balanced' should map to claude-sonnet
      expect(config.cliConfig?.models[1].cli).toBe('claude')
      // 'premium' should map to claude-opus
      expect(config.cliConfig?.models[2].cli).toBe('claude')
    })

    test('parses full model paths', () => {
      const config = defineSimpleConfig({
        models: ['opencode/custom/model'],
      })

      expect(config.cliConfig?.models[0].cli).toBe('opencode')
      expect(config.cliConfig?.models[0].model).toBe('custom/model')
    })

    test('enables autoCommit plugin when specified', () => {
      const config = defineSimpleConfig({
        models: ['claude-sonnet'],
        autoCommit: true,
      })

      expect(config.plugins).toHaveLength(1)
      expect(config.plugins?.[0].name).toBe('git-autocommit')
    })

    test('enables smartTests plugin when specified', () => {
      const config = defineSimpleConfig({
        models: ['claude-sonnet'],
        smartTests: true,
      })

      expect(config.plugins?.some(p => p.name === 'smart-tasks')).toBe(true)
    })

    test('enables taskRecovery plugin when specified', () => {
      const config = defineSimpleConfig({
        models: ['claude-sonnet'],
        taskRecovery: true,
      })

      expect(config.plugins?.some(p => p.name === 'task-recovery')).toBe(true)
    })

    test('preserves custom options', () => {
      const config = defineSimpleConfig({
        models: ['claude-sonnet'],
        maxIterations: 100,
        timeout: 300,
        namespace: 'custom',
        autoConfirm: true,
        debug: true,
      } as SimpleConfigOptions)

      expect(config.maxIterations).toBe(100)
      expect(config.timeout).toBe(300)
      expect(config.namespace).toBe('custom')
      expect(config.autoConfirm).toBe(true)
      expect(config.debug).toBe(true)
    })
  })

  describe('Presets', () => {
    test('fastAndCheap preset uses fast models', () => {
      expect(Presets.fastAndCheap.models).toContain('gemini-flash')
      expect(Presets.fastAndCheap.models).toContain('claude-haiku')
      expect(Presets.fastAndCheap.selectionStrategy).toBe('cost-aware')
    })

    test('balanced preset uses balanced models', () => {
      expect(Presets.balanced.models).toContain('claude-sonnet')
      expect(Presets.balanced.models).toContain('gemini-pro')
    })

    test('highQuality preset uses premium models', () => {
      expect(Presets.highQuality.models).toContain('claude-opus')
      expect(Presets.highQuality.models).toContain('claude-sonnet')
      expect(Presets.highQuality.selectionStrategy).toBe('capability')
    })

    test('freeTier preset uses only free models', () => {
      expect(Presets.freeTier.models).toEqual(['gemini-flash'])
      expect(Presets.freeTier.fallbackModels).toEqual([])
    })

    test('parallel preset has parallel setting', () => {
      expect(Presets.parallel.parallel).toBe(5)
      expect(Presets.parallel.selectionStrategy).toBe('random')
    })
  })

  describe('createPresetConfig', () => {
    test('creates config from preset', () => {
      const config = createPresetConfig(Presets.fastAndCheap)

      expect(config.parallel).toBe(1)
      expect(config.cliConfig?.models).toHaveLength(2)
      expect(config.cliConfig?.selectionStrategy).toBe('cost-aware')
    })

    test('allows preset overrides', () => {
      const config = createPresetConfig(Presets.fastAndCheap, {
        parallel: 5,
        autoCommit: true,
      })

      expect(config.parallel).toBe(5)
      expect(config.plugins?.some(p => p.name === 'git-autocommit')).toBe(true)
    })
  })

  describe('defineEasyConfig', () => {
    test('creates config with simple model names', () => {
      const config = defineEasyConfig({
        models: ['claude-sonnet', 'gemini-flash'],
        parallel: 3,
      })

      expect(config.parallel).toBe(3)
      expect(config.cliConfig?.models).toHaveLength(2)
    })

    test('accepts string backend shorthand', () => {
      const config = defineEasyConfig({
        models: ['claude-sonnet'],
        backend: 'tasks.json',
      })

      expect(config.backend).toEqual({
        type: 'json',
        tasksFile: 'tasks.json',
      })
    })

    test('merges with LoopworkConfig options', () => {
      const config = defineEasyConfig({
        models: ['claude-sonnet'],
        maxRetries: 5,
        circuitBreakerThreshold: 3,
      })

      expect(config.maxRetries).toBe(5)
      expect(config.circuitBreakerThreshold).toBe(3)
    })
  })

  describe('Backward Compatibility', () => {
    test('simple config produces valid LoopworkConfig', () => {
      const config = defineSimpleConfig({
        models: ['claude-sonnet'],
      })

      // Should have all required LoopworkConfig properties
      expect(config.backend).toBeDefined()
      expect(config.maxIterations).toBeDefined()
      expect(config.timeout).toBeDefined()
      expect(config.plugins).toBeDefined()
    })

    test('complex model names are handled gracefully', () => {
      const config = defineSimpleConfig({
        models: [
          'claude-sonnet',
          'GEMINI-FLASH', // case insensitive
          'unknown-model', // unknown model
        ],
      })

      expect(config.cliConfig?.models).toHaveLength(3)
      // Unknown model should default to opencode
      expect(config.cliConfig?.models[2].cli).toBe('opencode')
    })
  })
})
