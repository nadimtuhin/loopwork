import { describe, expect, test, beforeEach, spyOn } from 'bun:test'
import { PersistenceStateManager } from '../manager'
import type { IPersistenceLayer, LockInfo, StateManagerConfig } from '@loopwork-ai/contracts/state'

describe('PersistenceStateManager', () => {
  let mockPersistence: IPersistenceLayer
  let manager: PersistenceStateManager
  let acquiredLockId: string | undefined

  beforeEach(() => {
    acquiredLockId = undefined
    mockPersistence = {
      name: 'mock',
      initialize: async () => {},
      acquireLock: async (name, opts) => {
        const lockId = 'mock-lock-id'
        return { lockId, acquiredAt: new Date(), pid: 123 }
      },
      releaseLock: async (lockId) => {
        acquiredLockId = lockId
      },
      // Other methods mocked as no-ops or returning null
      get: async () => null,
      set: async () => {},
      delete: async () => {},
      exists: async () => false,
      keys: async () => [],
      atomicUpdate: async () => {},
      healthCheck: async () => ({ healthy: true })
    }
    
    manager = new PersistenceStateManager({
      persistence: mockPersistence,
      namespace: 'test-ns'
    } as StateManagerConfig)
  })

  test('should acquire and release lock using lockId', async () => {
    const result = await manager.acquireLock()
    expect(result).toBe(true)
    
    await manager.releaseLock()
    expect(acquiredLockId).toBe('mock-lock-id')
  })

  test('should not call releaseLock if lock was not acquired', async () => {
    // Override acquireLock to return null
    mockPersistence.acquireLock = async () => null
    
    const result = await manager.acquireLock()
    expect(result).toBe(false)
    
    await manager.releaseLock()
    expect(acquiredLockId).toBeUndefined()
  })
})
