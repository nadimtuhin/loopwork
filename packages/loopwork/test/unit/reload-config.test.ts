/**
 * Unit tests for reloadConfig function
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { reloadConfig, getConfigHotReloadManager, resetConfigHotReloadManager, ConfigReloadEvent } from '../../src/core/config'

describe('reloadConfig function', () => {
  beforeEach(() => {
    resetConfigHotReloadManager()
  })

  afterEach(() => {
    resetConfigHotReloadManager()
  })

  test('should return null when hot reload is not active', async () => {
    // No config loaded, should return null
    const result = await reloadConfig()
    expect(result).toBeNull()
  })

  test('should return null when manager is not watching', async () => {
    // Get manager but don't start watching
    const manager = getConfigHotReloadManager()
    expect(manager.isWatching()).toBe(false)

    const result = await reloadConfig()
    expect(result).toBeNull()
  })

  test('should return null when currentConfig is null', async () => {
    // Manually set up manager state without proper config
    const manager = getConfigHotReloadManager()
    // Force null current config by resetting
    resetConfigHotReloadManager()

    const result = await reloadConfig()
    expect(result).toBeNull()
  })

  test('should be a function', () => {
    expect(typeof reloadConfig).toBe('function')
  })

  test('should be async', async () => {
    const result = reloadConfig()
    expect(result).toBeInstanceOf(Promise)
    await result // Should not throw
  })
})

describe('reloadConfig with mock manager', () => {
  test('should access manager singleton', () => {
    const manager1 = getConfigHotReloadManager()
    const manager2 = getConfigHotReloadManager()
    expect(manager1).toBe(manager2)
  })

  test('manager should have reloadConfig method', () => {
    const manager = getConfigHotReloadManager()
    expect(typeof manager.reloadConfig).toBe('function')
  })

  test('manager should have isWatching method', () => {
    const manager = getConfigHotReloadManager()
    expect(typeof manager.isWatching).toBe('function')
  })

  test('manager should have getCurrentConfig method', () => {
    const manager = getConfigHotReloadManager()
    expect(typeof manager.getCurrentConfig).toBe('function')
  })

  test('manager should have start method', () => {
    const manager = getConfigHotReloadManager()
    expect(typeof manager.start).toBe('function')
  })

  test('manager should have stop method', () => {
    const manager = getConfigHotReloadManager()
    expect(typeof manager.stop).toBe('function')
  })

  test('manager should have onReload method', () => {
    const manager = getConfigHotReloadManager()
    expect(typeof manager.onReload).toBe('function')
  })

  test('manager should have offReload method', () => {
    const manager = getConfigHotReloadManager()
    expect(typeof manager.offReload).toBe('function')
  })
})

describe('ConfigReloadEvent interface', () => {
  test('should have timestamp property', () => {
    const event: ConfigReloadEvent = {
      timestamp: new Date(),
      configPath: '/test/config.ts',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config: {} as any,
    }
    expect(event.timestamp).toBeInstanceOf(Date)
  })

  test('should have configPath property', () => {
    const event: ConfigReloadEvent = {
      timestamp: new Date(),
      configPath: '/test/config.ts',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config: {} as any,
    }
    expect(typeof event.configPath).toBe('string')
  })

  test('should have config property', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockConfig: any = { maxIterations: 10 }
    const event: ConfigReloadEvent = {
      timestamp: new Date(),
      configPath: '/test/config.ts',
      config: mockConfig,
    }
    expect(event.config).toBeDefined()
  })
})
