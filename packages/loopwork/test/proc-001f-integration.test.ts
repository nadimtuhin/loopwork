import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { spawn, ChildProcess } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { ProcessRegistry } from '../src/core/process-management/registry'
import { ProcessCleaner } from '../src/core/process-management/cleaner'
import { OrphanDetector } from '../src/core/process-management/orphan-detector'
import { isProcessAlive } from '../src/commands/shared/process-utils'

// Run tests serially to avoid file locking conflicts
describe.serial('PROC-001f: Process Management Integration (Real Processes)', () => {
  let tempDir: string
  let loopworkDir: string
  let spawnedProcesses: ChildProcess[] = []

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'proc-001f-'))
    loopworkDir = path.join(tempDir, '.loopwork')
    await fs.mkdir(loopworkDir, { recursive: true })
  })

  afterEach(async () => {
    // Cleanup all spawned processes
    for (const proc of spawnedProcesses) {
      if (proc.pid && isProcessAlive(proc.pid)) {
        try {
          process.kill(proc.pid, 'SIGKILL')
        } catch {
          // Ignore errors during cleanup
        }
      }
    }
    spawnedProcesses = []

    // Remove temporary directory
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  describe('Real Process Tests', () => {
    test('spawns real sleep process and tracks it in registry', async () => {
      const registry = new ProcessRegistry(loopworkDir)

      // Spawn a short-lived sleep process
      const proc = spawn('sleep', ['30'])
      expect(proc.pid).toBeDefined()
      spawnedProcesses.push(proc)

      const pid = proc.pid!

      // Track in registry
      registry.add(pid, {
        command: 'sleep',
        args: ['30'],
        namespace: 'test',
        startTime: Date.now()
      })

      // Verify it's tracked
      const tracked = registry.get(pid)
      expect(tracked).toBeDefined()
      expect(tracked?.pid).toBe(pid)
      expect(tracked?.command).toBe('sleep')
      expect(tracked?.args).toEqual(['30'])
      expect(tracked?.status).toBe('running')

      // Verify process is actually running
      expect(isProcessAlive(pid)).toBe(true)

      // Cleanup
      proc.kill('SIGKILL')
    })

    test('spawns real cat process and tracks it', async () => {
      const registry = new ProcessRegistry(loopworkDir)

      // Spawn cat process that will exit immediately
      const proc = spawn('cat', ['/dev/null'])
      expect(proc.pid).toBeDefined()
      spawnedProcesses.push(proc)

      const pid = proc.pid!

      // Track in registry
      registry.add(pid, {
        command: 'cat',
        args: ['/dev/null'],
        namespace: 'test',
        startTime: Date.now()
      })

      // Verify it's tracked
      const tracked = registry.get(pid)
      expect(tracked).toBeDefined()
      expect(tracked?.command).toBe('cat')
      expect(tracked?.args).toEqual(['/dev/null'])

      // Wait for process to exit
      await new Promise(resolve => proc.on('exit', resolve))

      // Verify process is no longer running
      expect(isProcessAlive(pid)).toBe(false)
    })

    test('tracks multiple real processes simultaneously', async () => {
      const registry = new ProcessRegistry(loopworkDir)

      // Spawn multiple sleep processes
      const proc1 = spawn('sleep', ['30'])
      const proc2 = spawn('sleep', ['30'])
      const proc3 = spawn('sleep', ['30'])

      spawnedProcesses.push(proc1, proc2, proc3)

      const pid1 = proc1.pid!
      const pid2 = proc2.pid!
      const pid3 = proc3.pid!

      // Track all in registry
      registry.add(pid1, {
        command: 'sleep',
        args: ['30'],
        namespace: 'test',
        startTime: Date.now()
      })
      registry.add(pid2, {
        command: 'sleep',
        args: ['30'],
        namespace: 'test',
        startTime: Date.now()
      })
      registry.add(pid3, {
        command: 'sleep',
        args: ['30'],
        namespace: 'test',
        startTime: Date.now()
      })

      // Verify all are tracked
      const tracked = registry.list()
      expect(tracked.length).toBe(3)

      const pids = tracked.map(p => p.pid).sort()
      expect(pids).toEqual([pid1, pid2, pid3].sort())

      // Verify all are alive
      expect(isProcessAlive(pid1)).toBe(true)
      expect(isProcessAlive(pid2)).toBe(true)
      expect(isProcessAlive(pid3)).toBe(true)
    })

    test('removes process from registry when manually removed', async () => {
      const registry = new ProcessRegistry(loopworkDir)

      // Spawn process
      const proc = spawn('sleep', ['30'])
      spawnedProcesses.push(proc)
      const pid = proc.pid!

      // Track in registry
      registry.add(pid, {
        command: 'sleep',
        args: ['30'],
        namespace: 'test',
        startTime: Date.now()
      })

      expect(registry.list().length).toBe(1)

      // Remove from registry (simulating process exit)
      registry.remove(pid)

      // Verify removed
      expect(registry.get(pid)).toBeUndefined()
      expect(registry.list().length).toBe(0)
    })
  })

  describe('Persistence Tests', () => {
    test('persists registry to JSON file', async () => {
      const registry = new ProcessRegistry(loopworkDir)

      // Spawn process
      const proc = spawn('sleep', ['30'])
      spawnedProcesses.push(proc)
      const pid = proc.pid!

      // Track in registry
      registry.add(pid, {
        command: 'sleep',
        args: ['30'],
        namespace: 'test-persist',
        startTime: Date.now()
      })

      // Persist to file
      await registry.persist()

      // Verify file exists
      const registryFile = path.join(loopworkDir, 'processes.json')
      const fileExists = await fs.access(registryFile).then(() => true).catch(() => false)
      expect(fileExists).toBe(true)

      // Verify file contents
      const content = await fs.readFile(registryFile, 'utf-8')
      const data = JSON.parse(content)

      expect(data.version).toBe(1)
      expect(data.parentPid).toBeDefined()
      expect(data.processes).toBeDefined()
      expect(data.processes.length).toBe(1)
      expect(data.processes[0].pid).toBe(pid)
      expect(data.processes[0].command).toBe('sleep')
      expect(data.processes[0].namespace).toBe('test-persist')
      expect(data.lastUpdated).toBeDefined()
    })

    test('loads registry from file on restart', async () => {
      // Stage 1: Create and persist registry
      const registry1 = new ProcessRegistry(loopworkDir)

      const proc = spawn('sleep', ['30'])
      spawnedProcesses.push(proc)
      const pid = proc.pid!

      registry1.add(pid, {
        command: 'sleep',
        args: ['30'],
        namespace: 'test-reload',
        startTime: Date.now()
      })

      await registry1.persist()

      // Stage 2: Create new registry instance and load (simulating restart)
      const registry2 = new ProcessRegistry(loopworkDir)
      await registry2.load()

      // Verify loaded data matches
      const loaded = registry2.list()
      expect(loaded.length).toBe(1)
      expect(loaded[0].pid).toBe(pid)
      expect(loaded[0].command).toBe('sleep')
      expect(loaded[0].namespace).toBe('test-reload')
      expect(loaded[0].args).toEqual(['30'])
      expect(loaded[0].status).toBe('running')
    })

    test('preserves state across multiple persist/load cycles', async () => {
      // Spawn two processes
      const proc1 = spawn('sleep', ['30'])
      const proc2 = spawn('sleep', ['30'])
      spawnedProcesses.push(proc1, proc2)

      const pid1 = proc1.pid!
      const pid2 = proc2.pid!

      // Cycle 1: Add proc1, persist
      const registry1 = new ProcessRegistry(loopworkDir)
      registry1.add(pid1, {
        command: 'sleep',
        args: ['30'],
        namespace: 'cycle-test',
        startTime: Date.now()
      })
      await registry1.persist()

      // Cycle 2: Load, add proc2, persist
      const registry2 = new ProcessRegistry(loopworkDir)
      await registry2.load()
      registry2.add(pid2, {
        command: 'sleep',
        args: ['30'],
        namespace: 'cycle-test',
        startTime: Date.now()
      })
      await registry2.persist()

      // Cycle 3: Load and verify both processes
      const registry3 = new ProcessRegistry(loopworkDir)
      await registry3.load()

      const loaded = registry3.list()
      expect(loaded.length).toBe(2)

      const pids = loaded.map(p => p.pid).sort()
      expect(pids).toEqual([pid1, pid2].sort())

      const namespaces = loaded.map(p => p.namespace)
      expect(namespaces.every(ns => ns === 'cycle-test')).toBe(true)
    })

    test('clears registry on load when no data file exists', async () => {
      // Create registry and persist empty state
      const registry1 = new ProcessRegistry(loopworkDir)
      await registry1.persist()

      // Create new registry instance and load
      const registry2 = new ProcessRegistry(loopworkDir)
      await registry2.load()

      // Verify empty
      expect(registry2.list()).toHaveLength(0)
    })
  })

  describe('Cleanup Tests', () => {
    test('detects orphan with dead parent PID', async () => {
      const registry = new ProcessRegistry(loopworkDir)

      const proc = spawn('sleep', ['30'])
      spawnedProcesses.push(proc)
      const pid = proc.pid!

      registry.add(pid, {
        command: 'sleep',
        args: ['30'],
        namespace: 'orphan-test',
        startTime: Date.now()
      })

      // Simulate orphan by setting dead parent PID
      const processInfo = registry.get(pid)
      if (processInfo) {
        // @ts-ignore - accessing private property for test
        ;(processInfo as any).parentPid = 99999
        // @ts-ignore - modifying internal map
        ;(registry as any).processes.set(pid, processInfo)
      }

      const detector = new OrphanDetector(
        registry,
        ['sleep', 'claude'],
        300000 // 5 minutes
      )

      const orphans = await detector.scan()

      expect(orphans.length).toBeGreaterThan(0)
      const orphan = orphans.find(o => o.pid === pid)
      expect(orphan).toBeDefined()
      expect(orphan?.reason).toBe('parent-dead')

      proc.kill('SIGKILL')
    })

    test('kills real orphan process with SIGTERM', async () => {
      const registry = new ProcessRegistry(loopworkDir)

      const proc = spawn('sleep', ['5'])
      spawnedProcesses.push(proc)
      const pid = proc.pid!

      registry.add(pid, {
        command: 'sleep',
        args: ['5'],
        namespace: 'kill-test',
        startTime: Date.now()
      })

      // Simulate orphan
      const processInfo = registry.get(pid)
      if (processInfo) {
        ;(processInfo as any).parentPid = 99999
        ;(registry as any).processes.set(pid, processInfo)
      }

      const detector = new OrphanDetector(registry, ['sleep'], 300000)
      const orphans = await detector.scan()

      expect(orphans.length).toBeGreaterThan(0)

      const cleaner = new ProcessCleaner(registry)
      const result = await cleaner.cleanup(orphans)

      expect(result.cleaned.length).toBeGreaterThan(0)
      expect(result.cleaned).toContain(pid)

      // Wait for process to terminate
      await new Promise(resolve => setTimeout(resolve, 6000))

      expect(isProcessAlive(pid)).toBe(false)
      expect(registry.get(pid)).toBeUndefined()
    }, 10000)

    test('cleans up multiple orphan processes in parallel', async () => {
      const registry = new ProcessRegistry(loopworkDir)

      const proc1 = spawn('sleep', ['30'])
      const proc2 = spawn('sleep', ['30'])
      const proc3 = spawn('sleep', ['30'])

      spawnedProcesses.push(proc1, proc2, proc3)

      const pid1 = proc1.pid!
      const pid2 = proc2.pid!
      const pid3 = proc3.pid!

      // Mark all as orphans
      for (const pid of [pid1, pid2, pid3]) {
        registry.add(pid, {
          command: 'sleep',
          args: ['30'],
          namespace: 'multi-kill',
          startTime: Date.now()
        })
        const processInfo = registry.get(pid)
        if (processInfo) {
          ;(processInfo as any).parentPid = 99999
          ;(registry as any).processes.set(pid, processInfo)
        }
      }

      const detector = new OrphanDetector(registry, ['sleep'], 300000)
      const orphans = await detector.scan()

      expect(orphans.length).toBe(3)

      const cleaner = new ProcessCleaner(registry)
      const result = await cleaner.cleanup(orphans)

      expect(result.cleaned.length).toBe(3)
      expect(result.cleaned).toContain(pid1)
      expect(result.cleaned).toContain(pid2)
      expect(result.cleaned).toContain(pid3)

      // Wait for processes to terminate
      await new Promise(resolve => setTimeout(resolve, 8000))

      expect(isProcessAlive(pid1)).toBe(false)
      expect(isProcessAlive(pid2)).toBe(false)
      expect(isProcessAlive(pid3)).toBe(false)
    })

    test('handles cleanup of already-dead process gracefully', async () => {
      const registry = new ProcessRegistry(loopworkDir)

      const proc = spawn('sleep', ['1'])
      const pid = proc.pid!

      // Wait for process to exit naturally
      await new Promise(resolve => proc.on('exit', resolve))
      spawnedProcesses.push(proc)

      // Add dead process to registry
      registry.add(pid, {
        command: 'sleep',
        args: ['1'],
        namespace: 'dead-test',
        startTime: Date.now()
      })

      // Simulate orphan
      const processInfo = registry.get(pid)
      if (processInfo) {
        ;(processInfo as any).parentPid = 99999
        ;(registry as any).processes.set(pid, processInfo)
      }

      const detector = new OrphanDetector(registry, ['sleep'], 300000)
      const orphans = await detector.scan()

      const cleaner = new ProcessCleaner(registry)
      const result = await cleaner.cleanup(orphans)

      // Should handle gracefully - dead process is already gone
      expect(result.failed.length).toBe(0)
    })

    test('verifies process termination after cleanup', async () => {
      const registry = new ProcessRegistry(loopworkDir)

      const proc = spawn('sleep', ['10'])
      spawnedProcesses.push(proc)
      const pid = proc.pid!

      registry.add(pid, {
        command: 'sleep',
        args: ['10'],
        namespace: 'verify-termination',
        startTime: Date.now()
      })

      // Kill manually and verify
      proc.kill('SIGTERM')
      await new Promise(resolve => setTimeout(resolve, 1000))

      expect(isProcessAlive(pid)).toBe(false)

      // Remove from registry
      registry.remove(pid)
      expect(registry.get(pid)).toBeUndefined()
    })
  })

  describe('End-to-End Scenario', () => {
    test('full lifecycle: spawn → persist → reload → detect → cleanup', async () => {
      // Stage 1: Spawn and track processes
      const registry1 = new ProcessRegistry(loopworkDir)

      const proc1 = spawn('sleep', ['30'])
      const proc2 = spawn('sleep', ['30'])
      spawnedProcesses.push(proc1, proc2)

      const pid1 = proc1.pid!
      const pid2 = proc2.pid!

      registry1.add(pid1, {
        command: 'sleep',
        args: ['30'],
        namespace: 'e2e-test',
        startTime: Date.now()
      })

      registry1.add(pid2, {
        command: 'sleep',
        args: ['30'],
        namespace: 'e2e-test',
        startTime: Date.now()
      })

      // Mark as orphans
      const info1 = registry1.get(pid1)
      const info2 = registry1.get(pid2)
      if (info1 && info2) {
        ;(info1 as any).parentPid = 99999
        ;(info2 as any).parentPid = 99999
        ;(registry1 as any).processes.set(pid1, info1)
        ;(registry1 as any).processes.set(pid2, info2)
      }

      // Persist to disk
      await registry1.persist()

      expect(isProcessAlive(pid1)).toBe(true)
      expect(isProcessAlive(pid2)).toBe(true)

      // Stage 2: Simulate restart by loading registry
      const registry2 = new ProcessRegistry(loopworkDir)
      await registry2.load()

      const loaded = registry2.list()
      expect(loaded.length).toBe(2)

      // Stage 3: Detect orphans
      const detector = new OrphanDetector(registry2, ['sleep'], 300000)
      const orphans = await detector.scan()

      expect(orphans.length).toBe(2)
      expect(orphans.some(o => o.pid === pid1)).toBe(true)
      expect(orphans.some(o => o.pid === pid2)).toBe(true)

      // Stage 4: Cleanup orphans
      const cleaner = new ProcessCleaner(registry2)
      const result = await cleaner.cleanup(orphans)

      expect(result.cleaned.length).toBe(2)

      // Wait for processes to terminate
      await new Promise(resolve => setTimeout(resolve, 7000))

      expect(isProcessAlive(pid1)).toBe(false)
      expect(isProcessAlive(pid2)).toBe(false)
      expect(registry2.list().length).toBe(0)

      // Stage 5: Verify persisted state is cleared
      await registry2.persist()

      const registry3 = new ProcessRegistry(loopworkDir)
      await registry3.load()
      expect(registry3.list().length).toBe(0)
    })
  })
})
