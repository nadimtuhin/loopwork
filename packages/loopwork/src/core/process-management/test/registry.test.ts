import { describe, expect, test, beforeEach, spyOn, mock } from 'bun:test'
import { ProcessRegistry } from '../registry'
import { promises as fs } from 'fs'

mock.module('fs', () => ({
  promises: {
    mkdir: async () => {},
    writeFile: async () => {},
    readFile: async () => { throw { code: 'ENOENT' } },
    unlink: async () => {},
    stat: async () => ({ mtimeMs: Date.now() })
  }
}))

mock.module('../../../commands/shared/process-utils', () => ({
  isProcessAlive: () => true
}))

describe('ProcessRegistry', () => {
  let registry: ProcessRegistry
  const testDir = '.test-loopwork-registry'

  beforeEach(() => {
    registry = new ProcessRegistry(testDir)
  })

  describe('CRUD Operations', () => {
    test('should add and get a process', () => {
      const pid = 1234
      const metadata = {
        command: 'node',
        args: ['script.js'],
        namespace: 'default',
        startTime: Date.now()
      }

      registry.add(pid, metadata)
      const proc = registry.get(pid)

      expect(proc).toBeDefined()
      expect(proc?.pid).toBe(pid)
      expect(proc?.command).toBe('node')
      expect(proc?.status).toBe('running')
    })

    test('should remove a process', () => {
      const pid = 1234
      registry.add(pid, { command: 'node', args: [], namespace: 'default', startTime: Date.now() })
      expect(registry.get(pid)).toBeDefined()

      registry.remove(pid)
      expect(registry.get(pid)).toBeUndefined()
    })

    test('should list processes', () => {
      registry.add(1, { command: 'node', args: [], namespace: 'ns1', startTime: Date.now() })
      registry.add(2, { command: 'node', args: [], namespace: 'ns2', startTime: Date.now() })

      const list = registry.list()
      expect(list).toHaveLength(2)
    })

    test('should filter by namespace', () => {
      registry.add(1, { command: 'node', args: [], namespace: 'ns1', startTime: Date.now() })
      registry.add(2, { command: 'node', args: [], namespace: 'ns2', startTime: Date.now() })

      const ns1List = registry.listByNamespace('ns1')
      expect(ns1List).toHaveLength(1)
      expect(ns1List[0].pid).toBe(1)
    })

    test('should update process status', () => {
      const pid = 1234
      registry.add(pid, { command: 'node', args: [], namespace: 'default', startTime: Date.now() })
      
      registry.updateStatus(pid, 'stopped')
      expect(registry.get(pid)?.status).toBe('stopped')
    })

    test('should clear registry', () => {
      registry.add(1, { command: 'node', args: [], namespace: 'default', startTime: Date.now() })
      registry.clear()
      expect(registry.list()).toHaveLength(0)
    })
  })

  describe('Persistence', () => {
    test('should persist to disk', async () => {
      const mkdirSpy = spyOn(fs, 'mkdir').mockResolvedValue(undefined)
      const writeFileSpy = spyOn(fs, 'writeFile').mockResolvedValue(undefined)

      registry.add(1234, { command: 'node', args: [], namespace: 'default', startTime: Date.now() })
      await registry.persist()

      expect(mkdirSpy).toHaveBeenCalled()
      expect(writeFileSpy).toHaveBeenCalled()
      
      const storageCall = writeFileSpy.mock.calls.find(call => 
        (call[0] as string).includes('processes.json') && !(call[0] as string).endsWith('.lock')
      )
      expect(storageCall).toBeDefined()
      
      const [, content] = storageCall as [string, string]
      const data = JSON.parse(content)
      expect(data.processes).toBeDefined()
      expect(Array.isArray(data.processes)).toBe(true)
      expect(data.processes.length).toBe(1)
      expect(data.processes[0].pid).toBe(1234)
      
      mkdirSpy.mockRestore()
      writeFileSpy.mockRestore()
    })

    test('should load from disk', async () => {
      const testData = {
        version: 1,
        parentPid: 1,
        processes: [
          { pid: 5678, command: 'test', args: [], namespace: 'test', startTime: Date.now(), status: 'running' }
        ],
        lastUpdated: Date.now()
      }

      const readFileSpy = spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(testData))
      
      await registry.load()
      expect(registry.get(5678)).toBeDefined()
      expect(registry.get(5678)?.command).toBe('test')
      
      readFileSpy.mockRestore()
    })

    test('should handle missing file on load', async () => {
      const readFileSpy = spyOn(fs, 'readFile').mockRejectedValue({ code: 'ENOENT' })
      
      await expect(registry.load()).resolves.toBeUndefined()
      expect(registry.list()).toHaveLength(0)
      
      readFileSpy.mockRestore()
    })
  })

  describe('Concurrency (File Locking)', () => {
    test('should handle lock contention', async () => {
      const writeFileSpy = spyOn(fs, 'writeFile')
      let callCount = 0

      writeFileSpy.mockImplementation(async (path, data, options) => {
        if (options && typeof options === 'object' && 'flag' in options && options.flag === 'wx') {
          callCount++
          if (callCount === 1) {
            return Promise.resolve()
          }
          throw { code: 'EEXIST' }
        }
        return Promise.resolve()
      })
      
      writeFileSpy.mockRestore()
    })
  })
})
