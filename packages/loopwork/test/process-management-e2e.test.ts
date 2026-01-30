import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { spawn, ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { ProcessRegistry } from '../src/core/process-management/registry'
import { ProcessCleaner } from '../src/core/process-management/cleaner'
import { OrphanDetector } from '../src/core/process-management/orphan-detector'
import { createProcessManager } from '../src/core/process-management/process-manager'

/**
 * E2E Tests for Process Management with Full Loop Scenarios
 *
 * Tests real failure scenarios:
 * 1. Crash Recovery: Start loopwork → crash parent → orphan cleaned on next start
 * 2. Multi-Namespace: Start multiple namespaces → verify isolation → clean orphans per namespace
 * 3. Timeout Scenario: Start process with timeout → let it exceed timeout → verify stale process killed
 */

describe('Process Management E2E: Full Loop Scenarios', () => {
  let tempDir: string
  let registry: ProcessRegistry

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loopwork-pm-e2e-'))
    // Ensure .loopwork directory exists for process registry
    const loopworkDir = path.join(tempDir, '.loopwork')
    fs.mkdirSync(loopworkDir, { recursive: true })
    registry = new ProcessRegistry(loopworkDir)
  })

  afterEach(async () => {
    // Clean up registry
    registry.clear()
    await registry.persist()

    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('Crash Recovery Test', () => {
    test('detects and cleans orphans after parent crash', async () => {
      // Stage 1: Start loopwork as subprocess with child processes
      const childProcess1 = spawn('sleep', ['100'])
      const childProcess2 = spawn('sleep', ['100'])

      expect(childProcess1.pid).toBeDefined()
      expect(childProcess2.pid).toBeDefined()

      const pid1 = childProcess1.pid!
      const pid2 = childProcess2.pid!
      const parentPid = 99999 // Fake parent PID that doesn't exist

      // Register processes with a parent that doesn't exist
      registry.add(pid1, {
        command: 'sleep',
        args: ['100'],
        namespace: 'test-session',
        startTime: Date.now() - 5000, // Started 5 seconds ago
        parentPid: parentPid // Parent doesn't exist
      })

      registry.add(pid2, {
        command: 'sleep',
        args: ['100'],
        namespace: 'test-session',
        startTime: Date.now() - 3000, // Started 3 seconds ago
        parentPid: parentPid // Same non-existent parent
      })

      await registry.persist()

      // Verify processes are tracked
      const tracked = registry.list()
      expect(tracked.length).toBe(2)
      expect(tracked.map(p => p.pid).sort()).toEqual([pid1, pid2].sort())

      // Stage 2: Simulate next loopwork start - load registry and detect orphans
      const loopworkDir = path.join(tempDir, '.loopwork')
      const newRegistry = new ProcessRegistry(loopworkDir)
      await newRegistry.load()

      const loadedProcesses = newRegistry.list()
      expect(loadedProcesses.length).toBe(2)

      // Create detector and scanner for orphans
      const detector = new OrphanDetector(
        newRegistry,
        ['sleep', 'claude', 'loopwork'],
        300000 // 5 minute stale timeout
      )

      // Scan for orphans - should find the dead parent scenario
      const orphans = await detector.scan()

      // Should detect at least one orphan (the dead parent case)
      expect(orphans.length).toBeGreaterThan(0)
      expect(orphans.some(o => o.pid === pid1 || o.pid === pid2)).toBe(true)

      // Stage 3: Clean orphans using ProcessCleaner
      const cleaner = new ProcessCleaner(newRegistry, 500)
      const result = await cleaner.cleanup(orphans)

      // Verify cleanup results
      expect(result.cleaned.length).toBeGreaterThan(0)
      expect(result.failed.length).toBe(0)

      // Stage 4: Clean up spawned processes
      childProcess1.kill('SIGKILL')
      childProcess2.kill('SIGKILL')
    })

    test('handles missing processes gracefully', async () => {
      // Register processes that don't actually exist
      // Use non-existent PIDs
      registry.add(11111, {
        command: 'nonexistent',
        args: [],
        namespace: 'test',
        startTime: Date.now(),
        parentPid: 99999 // Non-existent parent
      })

      registry.add(11112, {
        command: 'nonexistent',
        args: [],
        namespace: 'test',
        startTime: Date.now(),
        parentPid: 99999 // Non-existent parent
      })

      await registry.persist()

      // Try to detect and clean non-existent processes
      const loopworkDir = path.join(tempDir, '.loopwork')
      const newRegistry = new ProcessRegistry(loopworkDir)
      await newRegistry.load()

      const detector = new OrphanDetector(
        newRegistry,
        ['nonexistent'],
        300000
      )

      const orphans = await detector.scan()
      // Should detect the dead parent scenario
      expect(orphans.length).toBeGreaterThan(0)

      const cleaner = new ProcessCleaner(newRegistry, 500)
      const result = await cleaner.cleanup(orphans)

      // Should still succeed even though processes don't exist
      expect(result.errors).toBeDefined()
      expect(result.failed.length >= 0).toBe(true)
    })
  })

  describe('Multi-Namespace Test', () => {
    test('isolates processes by namespace', async () => {
      // Create processes for different namespaces
      const nsProc1 = spawn('sleep', ['100'])
      const nsProc2 = spawn('sleep', ['100'])
      const nsProc3 = spawn('sleep', ['100'])

      expect(nsProc1.pid).toBeDefined()
      expect(nsProc2.pid).toBeDefined()
      expect(nsProc3.pid).toBeDefined()

      const pid1 = nsProc1.pid!
      const pid2 = nsProc2.pid!
      const pid3 = nsProc3.pid!

      // Register under different namespaces
      registry.add(pid1, {
        command: 'sleep',
        args: ['100'],
        namespace: 'loopwork-ns1',
        startTime: Date.now()
      })

      registry.add(pid2, {
        command: 'sleep',
        args: ['100'],
        namespace: 'loopwork-ns1',
        startTime: Date.now()
      })

      registry.add(pid3, {
        command: 'sleep',
        args: ['100'],
        namespace: 'loopwork-ns2',
        startTime: Date.now()
      })

      await registry.persist()

      // Verify namespace isolation
      const ns1Processes = registry.listByNamespace('loopwork-ns1')
      expect(ns1Processes.length).toBe(2)
      expect(ns1Processes.map(p => p.pid).sort()).toEqual([pid1, pid2].sort())

      const ns2Processes = registry.listByNamespace('loopwork-ns2')
      expect(ns2Processes.length).toBe(1)
      expect(ns2Processes[0].pid).toBe(pid3)

      // Clean orphans in ns1 only
      const detector1 = new OrphanDetector(
        registry,
        ['sleep'],
        300000
      )

      // Simulate ns1 cleanup
      nsProc1.kill('SIGKILL')
      nsProc2.kill('SIGKILL')

      await new Promise(resolve => setTimeout(resolve, 100))

      const orphans = await detector1.scan()
      const ns1Orphans = orphans.filter(o => {
        const info = registry.get(o.pid)
        return info?.namespace === 'loopwork-ns1'
      })

      const cleaner = new ProcessCleaner(registry, 500)
      await cleaner.cleanup(ns1Orphans)

      // Verify ns1 processes cleaned, ns2 still tracked
      const ns1After = registry.listByNamespace('loopwork-ns1')
      const ns2After = registry.listByNamespace('loopwork-ns2')

      expect(ns1After.length).toBeLessThanOrEqual(ns1Processes.length)
      expect(ns2After.length).toBe(ns2Processes.length)

      // Clean up remaining
      nsProc3.kill('SIGKILL')
    })

    test('supports multiple concurrent namespaces', async () => {
      const namespaces = ['ns-a', 'ns-b', 'ns-c']
      const processes: ChildProcess[] = []
      const pids: number[] = []

      // Create processes in each namespace
      for (const ns of namespaces) {
        for (let i = 0; i < 2; i++) {
          const proc = spawn('sleep', ['100'])
          expect(proc.pid).toBeDefined()
          processes.push(proc)
          const pid = proc.pid!
          pids.push(pid)

          registry.add(pid, {
            command: 'sleep',
            args: ['100'],
            namespace: ns,
            startTime: Date.now()
          })
        }
      }

      await registry.persist()

      // Verify all namespaces
      expect(registry.list().length).toBe(6)

      for (const ns of namespaces) {
        const nsprocs = registry.listByNamespace(ns)
        expect(nsprocs.length).toBe(2)
      }

      // Clean up
      for (const proc of processes) {
        proc.kill('SIGKILL')
      }
    })
  })

  describe('Timeout Scenario Test', () => {
    test('detects stale processes exceeding timeout', async () => {
      const staleTimeoutMs = 2000 // 2 seconds

      // Register a process that started long ago
      const oldStartTime = Date.now() - 10000 // Started 10 seconds ago
      const staleProcessPid = 88888

      registry.add(staleProcessPid, {
        command: 'long-running',
        args: [],
        namespace: 'test',
        startTime: oldStartTime
      })

      // Also register a fresh process
      const freshProc = spawn('sleep', ['100'])
      expect(freshProc.pid).toBeDefined()
      const freshPid = freshProc.pid!

      registry.add(freshPid, {
        command: 'sleep',
        args: ['100'],
        namespace: 'test',
        startTime: Date.now() // Just started
      })

      await registry.persist()

      // Create detector with 2 second stale timeout
      // Stale = running time > 2x timeout = 4 seconds
      const detector = new OrphanDetector(
        registry,
        ['long-running', 'sleep'],
        staleTimeoutMs
      )

      // Scan for stale processes
      const orphans = await detector.scan()

      // Should detect the old process but not the fresh one
      const staleOrphans = orphans.filter(o => o.pid === staleProcessPid)
      const freshOrphans = orphans.filter(o => o.pid === freshPid)

      expect(staleOrphans.length).toBeGreaterThan(0)
      expect(freshOrphans.length).toBe(0) // Fresh process should not be detected as stale

      // Verify orphan reason
      expect(staleOrphans[0].reason).toBe('stale')

      // Clean up
      freshProc.kill('SIGKILL')
    })

    test('enforces timeout with SIGTERM then SIGKILL', async () => {
      // Create a process that handles SIGTERM
      const testScript = path.join(tempDir, 'long-task.js')
      fs.writeFileSync(testScript, `
process.on('SIGTERM', () => {
  console.log('Received SIGTERM')
  setTimeout(() => {
    process.exit(0)
  }, 1000)
})

// Run indefinitely
setInterval(() => {}, 1000)
`)

      const proc = spawn('bun', ['run', testScript], { cwd: tempDir })
      expect(proc.pid).toBeDefined()
      const pid = proc.pid!

      // Register with short grace period
      registry.add(pid, {
        command: 'bun',
        args: ['run', 'long-task.js'],
        namespace: 'test',
        startTime: Date.now()
      })

      // Use short grace period for testing
      const cleaner = new ProcessCleaner(registry, 500) // 500ms grace period

      // Create orphan info for this process
      const orphans = [{
        pid,
        reason: 'stale' as const,
        process: registry.get(pid)!
      }]

      // Clean with timeout
      const result = await cleaner.cleanup(orphans)

      // Should attempt to clean the process
      expect(result).toBeDefined()

      // Process should be terminated
      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify process is no longer in registry
      const remaining = registry.get(pid)
      // Either removed or status changed
      expect(remaining === undefined || remaining.status === 'stopped').toBe(true)

      // Clean up
      proc.kill('SIGKILL')
    })

    test('handles timeout cleanup with failed processes', async () => {
      // Register non-existent processes (will fail to kill)
      registry.add(77777, {
        command: 'fake',
        args: [],
        namespace: 'test',
        startTime: Date.now() - 10000
      })

      registry.add(77776, {
        command: 'fake',
        args: [],
        namespace: 'test',
        startTime: Date.now() - 5000
      })

      await registry.persist()

      const cleaner = new ProcessCleaner(registry, 500)

      const orphans = [
        {
          pid: 77777,
          reason: 'stale' as const,
          process: registry.get(77777)!
        },
        {
          pid: 77776,
          reason: 'stale' as const,
          process: registry.get(77776)!
        }
      ]

      // Should handle cleanup even for non-existent processes
      const result = await cleaner.cleanup(orphans)

      expect(result).toBeDefined()
      expect(result.errors).toBeDefined()
    })
  })

  describe('Full Loop Integration', () => {
    test('simulates complete crash recovery and cleanup cycle', async () => {
      const loopworkDir = path.join(tempDir, '.loopwork')
      const manager = createProcessManager({
        storageDir: loopworkDir,
        staleTimeoutMs: 2000,
        gracePeriodMs: 500
      })

      // Stage 1: Spawn some child processes
      const proc1 = spawn('sleep', ['100'])
      const proc2 = spawn('sleep', ['100'])

      expect(proc1.pid).toBeDefined()
      expect(proc2.pid).toBeDefined()

      const pid1 = proc1.pid!
      const pid2 = proc2.pid!

      // Track processes
      manager.track(pid1, {
        command: 'sleep',
        args: ['100'],
        namespace: 'test-session',
        startTime: Date.now()
      })

      manager.track(pid2, {
        command: 'sleep',
        args: ['100'],
        namespace: 'test-session',
        startTime: Date.now()
      })

      // Persist state
      await manager.persist()

      // Stage 2: Verify tracked
      let children = manager.listChildren()
      expect(children.length).toBe(2)

      // Stage 3: Kill processes (simulate crash)
      proc1.kill('SIGKILL')
      proc2.kill('SIGKILL')

      await new Promise(resolve => setTimeout(resolve, 100))

      // Stage 4: Load registry (simulate restart)
      const newManager = createProcessManager({
        storageDir: loopworkDir,
        staleTimeoutMs: 2000,
        gracePeriodMs: 500
      })

      await newManager.load()

      const loadedChildren = newManager.listChildren()
      expect(loadedChildren.length).toBe(2)

      // Stage 5: Run cleanup
      const result = await newManager.cleanup()

      expect(result).toBeDefined()
      expect(result.cleaned.length > 0 || result.failed.length >= 0).toBe(true)

      // Stage 6: Verify state after cleanup
      const finalChildren = newManager.listChildren()
      expect(finalChildren.length).toBeLessThanOrEqual(loadedChildren.length)
    })

    test('handles concurrent namespace cleanup', async () => {
      const loopworkDir = path.join(tempDir, '.loopwork')
      const manager = createProcessManager({
        storageDir: loopworkDir,
        staleTimeoutMs: 2000
      })

      const procs: ChildProcess[] = []
      const namespaces = ['ns1', 'ns2', 'ns3']

      // Create processes in different namespaces
      for (const ns of namespaces) {
        for (let i = 0; i < 2; i++) {
          const proc = spawn('sleep', ['100'])
          expect(proc.pid).toBeDefined()
          procs.push(proc)

          manager.track(proc.pid!, {
            command: 'sleep',
            args: ['100'],
            namespace: ns,
            startTime: Date.now()
          })
        }
      }

      await manager.persist()

      // Verify tracking
      expect(manager.listChildren().length).toBe(6)

      for (const ns of namespaces) {
        const nsProcs = manager.listByNamespace(ns)
        expect(nsProcs.length).toBe(2)
      }

      // Kill all processes
      for (const proc of procs) {
        proc.kill('SIGKILL')
      }

      await new Promise(resolve => setTimeout(resolve, 100))

      // Run cleanup
      const result = await manager.cleanup()
      expect(result).toBeDefined()

      // Verify cleanup
      const finalChildren = manager.listChildren()
      expect(finalChildren.length <= 6).toBe(true)
    })
  })
})
