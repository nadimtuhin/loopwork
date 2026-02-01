import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import type { PoolConfig, WorkerPoolConfig, PoolStats, ProcessTrackingInfo, TerminateCallback } from '../worker-pool-manager'
import { WorkerPoolManager } from '../worker-pool-manager'

describe('worker-pool-manager', () => {

  describe('WorkerPoolManager', () => {
    test('should instantiate without errors', () => {
      const config: WorkerPoolConfig = {
        pools: {
          default: { size: 2, nice: 10, memoryLimitMB: 512 }
        },
        defaultPool: 'default'
      }
      const instance = new WorkerPoolManager(config)
      expect(instance).toBeDefined()
      expect(instance).toBeInstanceOf(WorkerPoolManager)
    })

    test('should maintain instance identity', () => {
      const config: WorkerPoolConfig = {
        pools: {
          default: { size: 2, nice: 10, memoryLimitMB: 512 }
        },
        defaultPool: 'default'
      }
      const instance1 = new WorkerPoolManager(config)
      const instance2 = new WorkerPoolManager(config)
      expect(instance1).not.toBe(instance2)
    })
  })

  describe('PoolConfig', () => {
    test('should be a valid type', () => {
      const config: PoolConfig = { size: 2, nice: 10, memoryLimitMB: 512 }
      expect(config).toBeDefined()
    })
  })

  describe('WorkerPoolConfig', () => {
    test('should be a valid type', () => {
      const config: WorkerPoolConfig = {
        pools: { default: { size: 2, nice: 10, memoryLimitMB: 512 } },
        defaultPool: 'default'
      }
      expect(config).toBeDefined()
    })
  })

  describe('PoolStats', () => {
    test('should be a valid type', () => {
      const stats: PoolStats = {
        name: 'default',
        active: 1,
        idle: 0,
        limit: 2,
        queued: 0
      }
      expect(stats).toBeDefined()
    })
  })

  describe('ProcessTrackingInfo', () => {
    test('should be a valid type', () => {
      const info: ProcessTrackingInfo = {
        pid: 123,
        poolName: 'default',
        acquiredAt: Date.now()
      }
      expect(info).toBeDefined()
    })
  })

  describe('TerminateCallback', () => {
    test('should be a valid function type', () => {
      const callback: TerminateCallback = async (pid, reason) => {}
      expect(callback).toBeDefined()
      expect(typeof callback).toBe('function')
    })
  })
})
