import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { spawn, ChildProcess } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { ProcessRegistry } from '../src/core/process-management/registry'
import { ProcessCleaner } from '../src/core/process-management/cleaner'
import { OrphanDetector } from '../src/core/process-management/orphan-detector'
import { isProcessAlive } from '../src/commands/shared/process-utils'

describe('PROC-001f: Process Management Real Integration', () => {
  let tempDir: string
  let loopworkDir: string
  let spawnedProcesses: ChildProcess[] = []

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'proc-001f-'))
    loopworkDir = path.join(tempDir, '.loopwork')
    await fs.mkdir(loopworkDir, { recursive: true })
  })

  afterEach(async () => {
    for (const proc of spawnedProcesses) {
      if (proc.pid && isProcessAlive(proc.pid)) {
        try {
          process.kill(proc.pid, 'SIGKILL')
        } catch {
        }
      }
    }
    spawnedProcesses = []

    await fs.rm(tempDir, { recursive: true, force: true })
  })

  describe('Real Process Tests', () => {
    test('spawns real process and tracks it in registry', async () => {
      const registry = new ProcessRegistry(loopworkDir)

      // Spawn a real sleep process
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

    test('tracks multiple real processes', async () => {
      const registry = new ProcessRegistry(loopworkDir)

      // Spawn multiple processes
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

      // Cleanup
      proc1.kill('SIGKILL')
      proc2.kill('SIGKILL')
      proc3.kill('SIGKILL')
    })

    test('removes process from registry when killed', async () => {
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

      // Kill process and remove from registry
      proc.kill('SIGKILL')
      registry.remove(pid)

      // Verify removed
      expect(registry.get(pid)).toBeUndefined()
      expect(registry.list().length).toBe(0)
    })
  })

  describe('Persistence Tests', () => {
    test('persists registry to file', async () => {
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
      expect(data.processes).toBeDefined()
      expect(data.processes.length).toBe(1)
      expect(data.processes[0].pid).toBe(pid)
      expect(data.processes[0].command).toBe('sleep')
      expect(data.processes[0].namespace).toBe('test-persist')

      // Cleanup
      proc.kill('SIGKILL')
    })

    test('loads registry from file across restarts', async () => {
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

      // Stage 2: Create new registry instance and load
      const registry2 = new ProcessRegistry(loopworkDir)
      await registry2.load()

      // Verify loaded data matches
      const loaded = registry2.list()
      expect(loaded.length).toBe(1)
      expect(loaded[0].pid).toBe(pid)
      expect(loaded[0].command).toBe('sleep')
      expect(loaded[0].namespace).toBe('test-reload')
      expect(loaded[0].args).toEqual(['30'])

      // Verify process is still alive
      expect(isProcessAlive(pid)).toBe(true)

      // Cleanup
      proc.kill('SIGKILL')
    })

    test('preserves state across multiple persist/load cycles', async () => {
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

      // Cleanup
      proc1.kill('SIGKILL')
      proc2.kill('SIGKILL')
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

      const processInfo = registry.get(pid)!
      processInfo.parentPid = 99999
      registry['processes'].set(pid, processInfo)

      const detector = new OrphanDetector(
        registry,
        ['sleep', 'claude'],
        300000
      )

      const orphans = await detector.scan()

      expect(orphans.length).toBeGreaterThan(0)
      const orphan = orphans.find(o => o.pid === pid)
      expect(orphan).toBeDefined()
      expect(orphan?.reason).toBe('parent-dead')

      proc.kill('SIGKILL')
    })

    test('kills real orphan process', async () => {
      const registry = new ProcessRegistry(loopworkDir)

      const proc = spawn('sleep', ['2'])
      spawnedProcesses.push(proc)
      const pid = proc.pid!

      registry.add(pid, {
        command: 'sleep',
        args: ['30'],
        namespace: 'kill-test',
        startTime: Date.now()
      })

      const processInfo = registry.get(pid)!
      processInfo.parentPid = 99999
      registry['processes'].set(pid, processInfo)

      const detector = new OrphanDetector(registry, ['sleep'], 300000)
      const orphans = await detector.scan()

      expect(orphans.length).toBeGreaterThan(0)

      const cleaner = new ProcessCleaner(registry)
      const result = await cleaner.cleanup(orphans)

      expect(result.cleaned.length).toBeGreaterThan(0)
      expect(result.cleaned).toContain(pid)

      await new Promise(resolve => setTimeout(resolve, 3000))

      expect(isProcessAlive(pid)).toBe(false)

      expect(registry.get(pid)).toBeUndefined()
    }, 10000)

    test('cleans up multiple orphan processes', async () => {
      const registry = new ProcessRegistry(loopworkDir)

      const proc1 = spawn('sleep', ['30'])
      const proc2 = spawn('sleep', ['30'])
      const proc3 = spawn('sleep', ['30'])

      spawnedProcesses.push(proc1, proc2, proc3)

      const pid1 = proc1.pid!
      const pid2 = proc2.pid!
      const pid3 = proc3.pid!

      for (const pid of [pid1, pid2, pid3]) {
        registry.add(pid, {
          command: 'sleep',
          args: ['30'],
          namespace: 'multi-kill',
          startTime: Date.now()
        })
        const processInfo = registry.get(pid)!
        processInfo.parentPid = 99999
        registry['processes'].set(pid, processInfo)
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

      await new Promise(resolve => setTimeout(resolve, 8000))

      expect(isProcessAlive(pid1)).toBe(false)
      expect(isProcessAlive(pid2)).toBe(false)
      expect(isProcessAlive(pid3)).toBe(false)
    }, 15000)

    test('detects stale process exceeding timeout', async () => {
      const registry = new ProcessRegistry(loopworkDir)

      // Spawn process
      const proc = spawn('sleep', ['30'])
      spawnedProcesses.push(proc)
      const pid = proc.pid!

      // Track with old start time (simulate long-running process)
      const oldStartTime = Date.now() - 15000 // 15 seconds ago
      registry.add(pid, {
        command: 'sleep',
        args: ['30'],
        namespace: 'stale-test',
        startTime: oldStartTime
      })

      // Create detector with 5 second timeout
      // Stale threshold is 2x timeout = 10 seconds
      const detector = new OrphanDetector(registry, ['sleep'], 5000)

      // Scan for orphans
      const orphans = await detector.scan()

      // Should detect as stale (running 15s > 10s threshold)
      const staleOrphan = orphans.find(o => o.pid === pid && o.reason === 'stale')
      expect(staleOrphan).toBeDefined()

      // Cleanup
      proc.kill('SIGKILL')
    })

    test('handles cleanup of already-dead process gracefully', async () => {
      const registry = new ProcessRegistry(loopworkDir)

      const proc = spawn('sleep', ['1'])
      const pid = proc.pid!
      proc.kill('SIGKILL')

      await new Promise(resolve => setTimeout(resolve, 100))

      registry.add(pid, {
        command: 'sleep',
        args: ['1'],
        namespace: 'dead-test',
        startTime: Date.now()
      })

      const processInfo = registry.get(pid)!
      processInfo.parentPid = 99999
      registry['processes'].set(pid, processInfo)

      const detector = new OrphanDetector(registry, ['sleep'], 300000)
      const orphans = await detector.scan()

      const cleaner = new ProcessCleaner(registry)
      const result = await cleaner.cleanup(orphans)

      expect(result.failed.length).toBe(0)
    })
  })

  describe('End-to-End Scenario', () => {
    test('full lifecycle: spawn → persist → restart → detect → cleanup', async () => {
      const registry1 = new ProcessRegistry(loopworkDir)

      const proc1 = spawn('sleep', ['30'])
      const proc2 = spawn('sleep', ['30'])
      spawnedProcesses.push(proc1, proc2)

      const pid1 = proc1.pid!
      const pid2 = proc2.pid!

      registry1.add(pid1, {
        command: 'sleep',
        args: ['30'],
        namespace: 'e2e',
        startTime: Date.now()
      })

      registry1.add(pid2, {
        command: 'sleep',
        args: ['30'],
        namespace: 'e2e',
        startTime: Date.now()
      })

      const info1 = registry1.get(pid1)!
      info1.parentPid = 99999
      registry1['processes'].set(pid1, info1)

      const info2 = registry1.get(pid2)!
      info2.parentPid = 99999
      registry1['processes'].set(pid2, info2)

      await registry1.persist()

      expect(isProcessAlive(pid1)).toBe(true)
      expect(isProcessAlive(pid2)).toBe(true)

      const registry2 = new ProcessRegistry(loopworkDir)
      await registry2.load()

      const loaded = registry2.list()
      expect(loaded.length).toBe(2)

      const detector = new OrphanDetector(registry2, ['sleep'], 300000)
      const orphans = await detector.scan()

      expect(orphans.length).toBe(2)
      expect(orphans.some(o => o.pid === pid1)).toBe(true)
      expect(orphans.some(o => o.pid === pid2)).toBe(true)

      const cleaner = new ProcessCleaner(registry2)
      const result = await cleaner.cleanup(orphans)

      expect(result.cleaned.length).toBe(2)

      await new Promise(resolve => setTimeout(resolve, 6000))

      expect(isProcessAlive(pid1)).toBe(false)
      expect(isProcessAlive(pid2)).toBe(false)

      expect(registry2.list().length).toBe(0)

      await registry2.persist()

      const registry3 = new ProcessRegistry(loopworkDir)
      await registry3.load()
      expect(registry3.list().length).toBe(0)
    }, 10000)
  })
})
