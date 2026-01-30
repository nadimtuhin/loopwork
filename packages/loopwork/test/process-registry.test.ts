import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { promises as fs } from 'fs'
import path from 'path'
import { ProcessRegistry } from '../src/core/process-management/registry'
import type { ProcessMetadata } from '../src/contracts/process-manager'

describe('ProcessRegistry', () => {
  const testDir = '.test-loopwork-registry'
  const storagePath = path.join(testDir, 'processes.json')
  const lockPath = `${storagePath}.lock`
  let registry: ProcessRegistry

  beforeEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true })
    registry = new ProcessRegistry(testDir)
  })

  afterEach(async () => {
    // Clean up test files
    await fs.rm(testDir, { recursive: true, force: true })
  })

  describe('add and remove', () => {
    test('adds process to registry', () => {
      const metadata: ProcessMetadata = {
        command: 'node',
        args: ['script.js'],
        namespace: 'test',
        startTime: Date.now()
      }

      registry.add(12345, metadata)

      const process = registry.get(12345)
      expect(process).toBeDefined()
      expect(process?.pid).toBe(12345)
      expect(process?.command).toBe('node')
      expect(process?.status).toBe('running')
    })

    test('removes process from registry', () => {
      const metadata: ProcessMetadata = {
        command: 'node',
        args: ['script.js'],
        namespace: 'test',
        startTime: Date.now()
      }

      registry.add(12345, metadata)
      expect(registry.get(12345)).toBeDefined()

      registry.remove(12345)
      expect(registry.get(12345)).toBeUndefined()
    })
  })

  describe('updateStatus', () => {
    test('updates process status', () => {
      const metadata: ProcessMetadata = {
        command: 'node',
        args: ['script.js'],
        namespace: 'test',
        startTime: Date.now()
      }

      registry.add(12345, metadata)
      expect(registry.get(12345)?.status).toBe('running')

      registry.updateStatus(12345, 'stopped')
      expect(registry.get(12345)?.status).toBe('stopped')
    })

    test('does nothing for non-existent process', () => {
      registry.updateStatus(99999, 'stopped')
      expect(registry.get(99999)).toBeUndefined()
    })
  })

  describe('list and listByNamespace', () => {
    test('lists all processes', () => {
      const metadata1: ProcessMetadata = {
        command: 'node',
        args: ['script1.js'],
        namespace: 'test',
        startTime: Date.now()
      }
      const metadata2: ProcessMetadata = {
        command: 'node',
        args: ['script2.js'],
        namespace: 'prod',
        startTime: Date.now()
      }

      registry.add(12345, metadata1)
      registry.add(67890, metadata2)

      const processes = registry.list()
      expect(processes).toHaveLength(2)
      expect(processes.map(p => p.pid)).toContain(12345)
      expect(processes.map(p => p.pid)).toContain(67890)
    })

    test('filters by namespace', () => {
      const metadata1: ProcessMetadata = {
        command: 'node',
        args: ['script1.js'],
        namespace: 'test',
        startTime: Date.now()
      }
      const metadata2: ProcessMetadata = {
        command: 'node',
        args: ['script2.js'],
        namespace: 'prod',
        startTime: Date.now()
      }
      const metadata3: ProcessMetadata = {
        command: 'node',
        args: ['script3.js'],
        namespace: 'test',
        startTime: Date.now()
      }

      registry.add(12345, metadata1)
      registry.add(67890, metadata2)
      registry.add(11111, metadata3)

      const testProcesses = registry.listByNamespace('test')
      expect(testProcesses).toHaveLength(2)
      expect(testProcesses.map(p => p.pid)).toContain(12345)
      expect(testProcesses.map(p => p.pid)).toContain(11111)

      const prodProcesses = registry.listByNamespace('prod')
      expect(prodProcesses).toHaveLength(1)
      expect(prodProcesses[0].pid).toBe(67890)
    })
  })

  describe('clear', () => {
    test('clears all processes', () => {
      const metadata: ProcessMetadata = {
        command: 'node',
        args: ['script.js'],
        namespace: 'test',
        startTime: Date.now()
      }

      registry.add(12345, metadata)
      registry.add(67890, metadata)
      expect(registry.list()).toHaveLength(2)

      registry.clear()
      expect(registry.list()).toHaveLength(0)
    })
  })

  describe('persistence', () => {
    test('persists to disk', async () => {
      const metadata: ProcessMetadata = {
        command: 'node',
        args: ['script.js'],
        namespace: 'test',
        taskId: 'TASK-001',
        startTime: Date.now()
      }

      registry.add(12345, metadata)

      // Wait for auto-persist (async)
      await new Promise(resolve => setTimeout(resolve, 100))

      // Check file exists
      const content = await fs.readFile(storagePath, 'utf-8')
      const data = JSON.parse(content)

      expect(data.version).toBe(1)
      expect(data.processes).toHaveLength(1)
      expect(data.processes[0].pid).toBe(12345)
      expect(data.processes[0].command).toBe('node')
      expect(data.processes[0].taskId).toBe('TASK-001')
    })

    test('loads from disk', async () => {
      // Create registry, add process, persist
      const metadata: ProcessMetadata = {
        command: 'node',
        args: ['script.js'],
        namespace: 'test',
        startTime: Date.now()
      }

      registry.add(12345, metadata)
      await registry.persist()

      // Create new registry and load
      const newRegistry = new ProcessRegistry(testDir)
      await newRegistry.load()

      const process = newRegistry.get(12345)
      expect(process).toBeDefined()
      expect(process?.pid).toBe(12345)
      expect(process?.command).toBe('node')
    })

    test('handles missing file gracefully', async () => {
      const newRegistry = new ProcessRegistry(testDir)
      await newRegistry.load()

      expect(newRegistry.list()).toHaveLength(0)
    })
  })

  describe('file locking', () => {
    test('persists with file locking', async () => {
      const metadata: ProcessMetadata = {
        command: 'node',
        args: ['script.js'],
        namespace: 'test',
        startTime: Date.now()
      }

      registry.add(12345, metadata)
      await registry.persist()

      // Lock file should be released after persist
      let lockExists = false
      try {
        await fs.access(lockPath)
        lockExists = true
      } catch {
        lockExists = false
      }

      expect(lockExists).toBe(false)
    })
  })
})
