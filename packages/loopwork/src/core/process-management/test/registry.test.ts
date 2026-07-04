import { describe, expect, test, beforeEach, spyOn, mock } from 'bun:test'
import { ProcessRegistry, MemoryPersistence } from '@loopwork-ai/process-manager'

mock.module('../../../commands/shared/process-utils', () => ({
  isProcessAlive: () => true
}))

describe('ProcessRegistry', () => {
  let registry: ProcessRegistry
  let persistence: MemoryPersistence

  beforeEach(() => {
    persistence = new MemoryPersistence()
    registry = new ProcessRegistry(persistence)
  })

  describe('CRUD Operations', () => {
    test('should add and get a process', async () => {
      const pid = 1234
      const metadata = {
        command: 'node',
        args: ['script.js'],
        namespace: 'default',
        startTime: Date.now()
      }

      await registry.add(pid, metadata)
      const proc = registry.get(pid)

      expect(proc).toBeDefined()
      expect(proc?.pid).toBe(pid)
      expect(proc?.command).toBe('node')
      expect(proc?.status).toBe('running')
    })

    test('should remove a process', async () => {
      const pid = 1234
      await registry.add(pid, { command: 'node', args: [], namespace: 'default', startTime: Date.now() })
      expect(registry.get(pid)).toBeDefined()

      await registry.remove(pid)
      expect(registry.get(pid)).toBeUndefined()
    })

    test('should list processes', async () => {
      await registry.add(1, { command: 'node', args: [], namespace: 'ns1', startTime: Date.now() })
      await registry.add(2, { command: 'node', args: [], namespace: 'ns2', startTime: Date.now() })

      const list = registry.list()
      expect(list).toHaveLength(2)
    })

    test('should filter by namespace', async () => {
      await registry.add(1, { command: 'node', args: [], namespace: 'ns1', startTime: Date.now() })
      await registry.add(2, { command: 'node', args: [], namespace: 'ns2', startTime: Date.now() })

      const ns1List = registry.listByNamespace('ns1')
      expect(ns1List).toHaveLength(1)
      expect(ns1List[0].pid).toBe(1)
    })

    test('should update process status', async () => {
      const pid = 1234
      await registry.add(pid, { command: 'node', args: [], namespace: 'default', startTime: Date.now() })
      
      await registry.updateStatus(pid, 'stopped')
      expect(registry.get(pid)?.status).toBe('stopped')
    })

    test('should clear registry', async () => {
      await registry.add(1, { command: 'node', args: [], namespace: 'default', startTime: Date.now() })
      await registry.clear()
      expect(registry.list()).toHaveLength(0)
    })
  })

  describe('Persistence', () => {
    test('should persist to persistence layer', async () => {
      const setSpy = spyOn(persistence, 'set').mockResolvedValue(undefined)
      const lockSpy = spyOn(persistence, 'acquireLock').mockResolvedValue({ lockId: 'test', acquiredAt: new Date(), pid: process.pid })
      const unlockSpy = spyOn(persistence, 'releaseLock').mockResolvedValue(undefined)

      await registry.add(1234, { command: 'node', args: [], namespace: 'default', startTime: Date.now() })
      await registry.persist()

      expect(lockSpy).toHaveBeenCalled()
      expect(setSpy).toHaveBeenCalled()
      expect(unlockSpy).toHaveBeenCalled()
      
      const [, data] = setSpy.mock.calls[0] as [string, any]
      expect(data.processes).toBeDefined()
      expect(Array.isArray(data.processes)).toBe(true)
      expect(data.processes.length).toBe(1)
      expect(data.processes[0].pid).toBe(1234)
    })

    test('should load from persistence layer', async () => {
      const testData = {
        version: 1,
        parentPid: 1,
        processes: [
          { pid: 5678, command: 'test', args: [], namespace: 'test', startTime: Date.now(), status: 'running' }
        ],
        lastUpdated: Date.now()
      }

      spyOn(persistence, 'get').mockResolvedValue(testData)
      
      await registry.load()
      expect(registry.get(5678)).toBeDefined()
      expect(registry.get(5678)?.command).toBe('test')
    })
  })
})
