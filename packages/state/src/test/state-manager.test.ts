import { describe, expect, test, beforeEach } from 'bun:test'
import { StateManager } from '../state-manager'
import type { IPersistenceLayer, StateManagerConfig, StateSnapshot } from '@loopwork-ai/contracts/state'

describe('StateManager', () => {
  let mockPersistence: IPersistenceLayer
  let manager: StateManager

  beforeEach(() => {
    mockPersistence = {
      name: 'mock',
      initialize: async () => {},
      acquireLock: async (name, opts) => {
        return { lockId: 'mock-lock-id', acquiredAt: new Date(), pid: 123 }
      },
      releaseLock: async (lockId) => {},
      get: async <T>(_key: string): Promise<T | null> => null,
      set: async () => {},
      delete: async () => {},
      exists: async () => false,
      keys: async () => [],
      atomicUpdate: async () => {},
      healthCheck: async () => ({ healthy: true }),
      isLocked: async () => false,
    }

    manager = new StateManager({
      persistence: mockPersistence,
      namespace: 'test-ns',
    } as StateManagerConfig)
  })

  test('should return namespace', () => {
    expect(manager.getNamespace()).toBe('test-ns')
  })

  test('should save and load state', async () => {
    await manager.saveState(5, 3)

    const mockSnapshot: StateSnapshot = {
      lastIssue: 5,
      lastIteration: 3,
      lastOutputDir: '',
      startedAt: Date.now(),
    }
    mockPersistence.get = async <T>(_key: string): Promise<T | null> => mockSnapshot as unknown as T

    const result = await manager.loadState()
    expect(result.success).toBe(true)
    expect(result.snapshot?.lastIssue).toBe(5)
    expect(result.snapshot?.lastIteration).toBe(3)
  })

  test('should return null snapshot when no state exists', async () => {
    mockPersistence.get = async <T>(_key: string): Promise<T | null> => null

    const result = await manager.loadState()
    expect(result.success).toBe(true)
    expect(result.snapshot).toBe(null)
  })

  test('should handle corrupted state with invalid lastIssue', async () => {
    mockPersistence.get = async <T>(_key: string): Promise<T | null> => {
      return {
        lastIssue: 'invalid' as unknown as number,
        lastIteration: 0,
        lastOutputDir: '',
      } as unknown as T
    }

    const result = await manager.loadState()
    expect(result.success).toBe(false)
    expect(result.error).toContain('Corrupted state file')
    expect(result.snapshot).toBe(null)
  })

  test('should handle corrupted state with negative values', async () => {
    mockPersistence.get = async <T>(_key: string): Promise<T | null> => {
      return {
        lastIssue: -1,
        lastIteration: 0,
        lastOutputDir: '',
      } as unknown as T
    }

    const result = await manager.loadState()
    expect(result.success).toBe(false)
    expect(result.error).toContain('Negative values')
  })

  test('should handle corrupted state with old timestamp', async () => {
    const oldTimestamp = Date.now() - 2 * 365 * 24 * 60 * 60 * 1000
    mockPersistence.get = async <T>(_key: string): Promise<T | null> => {
      return {
        lastIssue: 1,
        lastIteration: 0,
        lastOutputDir: '',
        startedAt: oldTimestamp,
      } as unknown as T
    }

    const result = await manager.loadState()
    expect(result.success).toBe(false)
    expect(result.error).toContain('too old')
  })

  test('should clear state', async () => {
    let deletedKey = ''
    mockPersistence.delete = async (key) => {
      deletedKey = key
    }

    await manager.clearState()
    expect(deletedKey).toBe('session-test-ns')
  })

  test('should get and set plugin state', async () => {
    let storedValue: unknown = null
    mockPersistence.set = async (key, value) => {
      storedValue = value
    }
    mockPersistence.get = async <T>(_key: string): Promise<T | null> => ({ foo: 'bar' }) as unknown as T

    await manager.setPluginState('my-plugin', { foo: 'bar' })
    expect(storedValue).toEqual({ foo: 'bar' })

    const result = await manager.getPluginState<{ foo: string }>('my-plugin')
    expect(result?.foo).toBe('bar')
  })

  test('should list plugins', async () => {
    mockPersistence.keys = async () => [
      'plugin-test-ns-plugin-a',
      'plugin-test-ns-plugin-b',
    ]

    const plugins = await manager.listPlugins()
    expect(plugins).toEqual(['plugin-a', 'plugin-b'])
  })

  test('should acquire and release lock', async () => {
    const result = await manager.acquireLock()
    expect(result).toBe(true)

    await manager.releaseLock()
  })

  test('should check if locked', async () => {
    mockPersistence.isLocked = async () => true

    const result = await manager.isLocked()
    expect(result).toBe(true)
  })
})
