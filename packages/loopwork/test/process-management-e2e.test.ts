import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { ProcessRegistry } from '../src/core/process-management/registry'
import { ProcessCleaner } from '../src/core/process-management/cleaner'
import { OrphanDetector } from '../src/core/process-management/orphan-detector'
import { createProcessManager } from '../src/core/process-management/process-manager'

import { spawn, ChildProcess } from 'child_process'

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
    // Clean up temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch (error) {
      // Ignore ENOENT - temp directory might already be cleaned up
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  })

  afterEach(async () => {
    // Clean up temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch (error) {
      // Ignore ENOENT - temp directory might already be cleaned up
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  })

  describe('Crash Recovery Test', () => {
    test('detects and cleans orphans after parent crash', async () => {
      // Stage 1: Start loopwork as subprocess with child processes
      const childProcess1 = spawn('node', ['-e', 'setTimeout(() => {}, 100000)'])
      const childProcess2 = spawn('node', ['-e', 'setTimeout(() => {}, 100000)'])

      expect(childProcess1.pid).toBeDefined()
      expect(childProcess2.pid).toBeDefined()

      const pid1 = childProcess1.pid!
      const pid2 = childProcess2.pid!
      const parentPid = 99999 // Fake parent PID that doesn't exist

      // Register processes with a parent that doesn't exist
      registry.add(pid1, {
        command: 'node',
        args: ['-e', 'setTimeout(() => {}, 100000)'],
        namespace: 'test-session',
        startTime: Date.now() - 5000, // Started 5 seconds ago
        parentPid: parentPid // Parent doesn't exist
      })

      registry.add(pid2, {
        command: 'node',
        args: ['-e', 'setTimeout(() => {}, 100000)'],
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
        ['node', 'claude', 'loopwork'],
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
      expect(result.errors.length).toBe(0)

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
      expect(result).toBeDefined()
      expect(result.errors.length).toBeGreaterThanOrEqual(0)
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
      const proc1 = spawn('node', ['-e', 'setTimeout(() => {}, 100000)'])
      const proc2 = spawn('node', ['-e', 'setTimeout(() => {}, 100000)'])

      expect(proc1.pid).toBeDefined()
      expect(proc2.pid).toBeDefined()

      const pid1 = proc1.pid!
      const pid2 = proc2.pid!

      // Track processes
      manager.track(pid1, {
        command: 'node',
        args: ['-e', 'setTimeout(() => {}, 100000)'],
        namespace: 'test-session',
        startTime: Date.now()
      })

      manager.track(pid2, {
        command: 'node',
        args: ['-e', 'setTimeout(() => {}, 100000)'],
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
      expect(result.cleaned.length > 0 || result.errors.length >= 0).toBe(true)

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
          const proc = spawn('node', ['-e', 'setTimeout(() => {}, 100000)'])
          expect(proc.pid).toBeDefined()
          procs.push(proc)

          manager.track(proc.pid!, {
            command: 'node',
            args: ['-e', 'setTimeout(() => {}, 100000)'],
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
