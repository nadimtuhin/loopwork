import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'
import { createProcessManager } from '../src/core/process-management/process-manager'
import type { IProcessManager } from '../src/contracts/process-manager'

/**
 * Integration tests for ProcessManager using REAL processes
 *
 * Tests:
 * - Spawning real child processes (sleep, cat)
 * - Tracking processes in registry
 * - Cleanup of real processes
 * - Registry persistence across restarts
 * - Orphan detection with real PIDs
 *
 * Uses short-lived test processes to avoid resource leaks
 */
describe('ProcessManager Integration (Real Processes)', () => {
  const testDir = '.test-process-manager-integration'
  let manager: IProcessManager
  let spawnedPids: number[] = []

  beforeEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true })
    await fs.mkdir(testDir, { recursive: true })

    // Create manager with test directory
    manager = createProcessManager({
      storageDir: testDir,
      staleTimeoutMs: 5000, // 5 seconds for tests
      gracePeriodMs: 1000 // 1 second grace period
    })

    spawnedPids = []
  })

  afterEach(async () => {
    // Kill any remaining test processes
    for (const pid of spawnedPids) {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        // Ignore errors - process may already be dead
      }
    }

    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true })
  })

  describe('Real Process Spawning and Tracking', () => {
    test('spawns real process and tracks it automatically', async () => {
      // Spawn a real sleep process
      const proc = manager.spawn('sleep', ['10'])

      expect(proc.pid).toBeDefined()
      expect(proc.pid).toBeGreaterThan(0)

      // Track for cleanup
      spawnedPids.push(proc.pid!)

      // Verify it's tracked in registry
      const children = manager.listChildren()
      const tracked = children.find(p => p.pid === proc.pid)

      expect(tracked).toBeDefined()
      expect(tracked?.command).toBe('sleep')
      expect(tracked?.args).toEqual(['10'])
      expect(tracked?.status).toBe('running')

      // Cleanup
      proc.kill('SIGKILL')
    })

    test('tracks multiple real processes', async () => {
      // Spawn multiple processes
      const proc1 = manager.spawn('sleep', ['5'])
      const proc2 = manager.spawn('sleep', ['5'])
      const proc3 = manager.spawn('sleep', ['5'])

      spawnedPids.push(proc1.pid!, proc2.pid!, proc3.pid!)

      // Verify all are tracked
      const children = manager.listChildren()
      expect(children.length).toBeGreaterThanOrEqual(3)

      const pids = children.map(p => p.pid)
      expect(pids).toContain(proc1.pid)
      expect(pids).toContain(proc2.pid)
      expect(pids).toContain(proc3.pid)

      // Cleanup
      proc1.kill('SIGKILL')
      proc2.kill('SIGKILL')
      proc3.kill('SIGKILL')
    })

    test('automatically untracks process when it exits', async () => {
      // Spawn a very short-lived process
      const proc = manager.spawn('sleep', ['0.1'])
      const pid = proc.pid!
      spawnedPids.push(pid)

      // Verify it's tracked
      expect(manager.listChildren().some(p => p.pid === pid)).toBe(true)

      // Wait for process to exit
      await new Promise((resolve) => {
        proc.on('close', resolve)
      })

      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify it's untracked
      expect(manager.listChildren().some(p => p.pid === pid)).toBe(false)
    })

    test('manual track and untrack of external process', async () => {
      // Spawn process outside of manager
      const proc = spawn('sleep', ['10'])
      const pid = proc.pid!
      spawnedPids.push(pid)

      // Manually track it
      manager.track(pid, {
        command: 'sleep',
        args: ['10'],
        namespace: 'test',
        startTime: Date.now()
      })

      // Verify it's tracked
      const tracked = manager.listChildren().find(p => p.pid === pid)
      expect(tracked).toBeDefined()
      expect(tracked?.command).toBe('sleep')

      // Manually untrack
      manager.untrack(pid)

      // Verify it's untracked
      expect(manager.listChildren().some(p => p.pid === pid)).toBe(false)

      // Cleanup
      proc.kill('SIGKILL')
    })
  })

  describe('Real Process Cleanup', () => {
    test('kills real process using manager.kill()', async () => {
      // Spawn process
      const proc = manager.spawn('sleep', ['30'])
      const pid = proc.pid!
      spawnedPids.push(pid)

      // Verify process is alive
      expect(() => process.kill(pid, 0)).not.toThrow()

      // Kill using manager
      const killed = manager.kill(pid, 'SIGTERM')
      expect(killed).toBe(true)

      // Wait for process to die
      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify process is dead
      expect(() => process.kill(pid, 0)).toThrow()

      // Verify it's removed from registry
      expect(manager.listChildren().some(p => p.pid === pid)).toBe(false)
    })

    test('cleanup() detects and kills orphaned real processes', async () => {
      // Spawn a process and track it manually (simulating orphan)
      const proc = spawn('sleep', ['30'])
      const pid = proc.pid!
      spawnedPids.push(pid)

      // Track with very old start time to trigger stale detection
      manager.track(pid, {
        command: 'sleep',
        args: ['30'],
        namespace: 'loopwork',
        startTime: Date.now() - 20000 // 20 seconds ago (older than 2x timeout)
      })

      // Verify process is alive before cleanup
      expect(() => process.kill(pid, 0)).not.toThrow()

      // Run cleanup
      const result = await manager.cleanup()

      // Verify cleanup detected and killed the orphan
      expect(result.cleaned).toContain(pid)
      expect(result.failed).not.toContain(pid)

      // Wait for process to die
      await new Promise(resolve => setTimeout(resolve, 1500))

      // Verify process is dead
      expect(() => process.kill(pid, 0)).toThrow()
    })

    test('cleanup() handles processes that are already dead', async () => {
      // Create a process and kill it manually
      const proc = spawn('sleep', ['0.1'])
      const pid = proc.pid!
      spawnedPids.push(pid)

      // Track it
      manager.track(pid, {
        command: 'sleep',
        args: ['0.1'],
        namespace: 'test',
        startTime: Date.now() - 20000
      })

      // Wait for process to exit
      await new Promise(resolve => {
        proc.on('close', resolve)
      })

      // Verify process is dead
      expect(() => process.kill(pid, 0)).toThrow()

      // Run cleanup - should handle gracefully
      const result = await manager.cleanup()

      // Should still "clean" it (remove from registry)
      expect(result.cleaned).toContain(pid)
      expect(result.failed).not.toContain(pid)
    })
  })

  describe('Registry Persistence Across Restarts', () => {
    test('persists registry to disk with real processes', async () => {
      // Spawn a process
      const proc = manager.spawn('sleep', ['30'])
      const pid = proc.pid!
      spawnedPids.push(pid)

      // Force persist
      await manager.persist()

      // Verify file exists
      const registryPath = path.join(testDir, 'processes.json')
      const content = await fs.readFile(registryPath, 'utf-8')
      const data = JSON.parse(content)

      expect(data.version).toBe(1)
      expect(data.processes).toBeDefined()
      expect(data.processes.some((p: any) => p.pid === pid)).toBe(true)

      // Cleanup
      proc.kill('SIGKILL')
    })

    test('loads registry from disk and restores state', async () => {
      // First manager: spawn and persist
      const proc = manager.spawn('sleep', ['30'])
      const pid = proc.pid!
      spawnedPids.push(pid)

      await manager.persist()

      // Create new manager instance (simulating restart)
      const newManager = createProcessManager({ storageDir: testDir })
      await newManager.load()

      // Verify process is still tracked
      const children = newManager.listChildren()
      const tracked = children.find(p => p.pid === pid)

      expect(tracked).toBeDefined()
      expect(tracked?.command).toBe('sleep')
      expect(tracked?.args).toEqual(['30'])

      // Cleanup
      proc.kill('SIGKILL')
    })

    test('handles missing registry file gracefully', async () => {
      // Create new manager with empty directory
      const emptyDir = path.join(testDir, 'empty')
      await fs.mkdir(emptyDir, { recursive: true })

      const newManager = createProcessManager({ storageDir: emptyDir })
      await newManager.load()

      // Should have no processes
      expect(newManager.listChildren()).toHaveLength(0)
    })

    test('persistence survives multiple restarts', async () => {
      // First manager: spawn process
      const proc1 = manager.spawn('sleep', ['30'])
      const pid1 = proc1.pid!
      spawnedPids.push(pid1)
      await manager.persist()

      // Second manager: load, spawn another, persist
      const manager2 = createProcessManager({ storageDir: testDir })
      await manager2.load()
      const proc2 = manager2.spawn('sleep', ['30'])
      const pid2 = proc2.pid!
      spawnedPids.push(pid2)
      await manager2.persist()

      // Third manager: load and verify both processes
      const manager3 = createProcessManager({ storageDir: testDir })
      await manager3.load()

      const children = manager3.listChildren()
      expect(children.some(p => p.pid === pid1)).toBe(true)
      expect(children.some(p => p.pid === pid2)).toBe(true)

      // Cleanup
      proc1.kill('SIGKILL')
      proc2.kill('SIGKILL')
    })
  })

  describe('Orphan Detection with Real PIDs', () => {
    test('detects process with dead parent PID', async () => {
      // Spawn a process
      const proc = spawn('sleep', ['30'])
      const pid = proc.pid!
      spawnedPids.push(pid)

      // Track with a fake dead parent PID
      manager.track(pid, {
        command: 'sleep',
        args: ['30'],
        namespace: 'test',
        startTime: Date.now()
      })

      // Manually set parent PID to a dead process
      const children = manager.listChildren()
      const tracked = children.find(p => p.pid === pid)
      if (tracked) {
        ;(tracked as any).parentPid = 99999 // Non-existent PID
      }

      // Run cleanup
      const result = await manager.cleanup()

      // Should detect as orphan and kill it
      expect(result.cleaned).toContain(pid)

      // Cleanup
      try {
        proc.kill('SIGKILL')
      } catch {
        // Already killed by cleanup
      }
    })

    test('detects stale process running too long', async () => {
      // Spawn a process
      const proc = spawn('sleep', ['30'])
      const pid = proc.pid!
      spawnedPids.push(pid)

      // Track with old start time (15 seconds ago, more than 2x 5 second timeout)
      manager.track(pid, {
        command: 'sleep',
        args: ['30'],
        namespace: 'loopwork',
        startTime: Date.now() - 15000
      })

      // Run cleanup
      const result = await manager.cleanup()

      // Should detect as stale and kill it
      expect(result.cleaned).toContain(pid)

      // Cleanup
      try {
        proc.kill('SIGKILL')
      } catch {
        // Already killed by cleanup
      }
    })

    test('does not kill recent processes', async () => {
      // Spawn a process
      const proc = manager.spawn('sleep', ['5'])
      const pid = proc.pid!
      spawnedPids.push(pid)

      // Process is recent (just spawned)
      // Run cleanup
      const result = await manager.cleanup()

      // Should NOT be cleaned (not stale, parent alive)
      expect(result.cleaned).not.toContain(pid)

      // Process should still be alive
      expect(() => process.kill(pid, 0)).not.toThrow()

      // Cleanup
      proc.kill('SIGKILL')
    })
  })

  describe('Namespaces with Real Processes', () => {
    test('lists processes by namespace', async () => {
      // Spawn processes in different namespaces
      const proc1 = spawn('sleep', ['30'])
      const proc2 = spawn('sleep', ['30'])
      const proc3 = spawn('sleep', ['30'])

      spawnedPids.push(proc1.pid!, proc2.pid!, proc3.pid!)

      manager.track(proc1.pid!, {
        command: 'sleep',
        args: ['30'],
        namespace: 'test-ns-1',
        startTime: Date.now()
      })

      manager.track(proc2.pid!, {
        command: 'sleep',
        args: ['30'],
        namespace: 'test-ns-2',
        startTime: Date.now()
      })

      manager.track(proc3.pid!, {
        command: 'sleep',
        args: ['30'],
        namespace: 'test-ns-1',
        startTime: Date.now()
      })

      // List by namespace
      const ns1Processes = manager.listByNamespace('test-ns-1')
      const ns2Processes = manager.listByNamespace('test-ns-2')

      expect(ns1Processes).toHaveLength(2)
      expect(ns2Processes).toHaveLength(1)
      expect(ns1Processes.map(p => p.pid)).toContain(proc1.pid)
      expect(ns1Processes.map(p => p.pid)).toContain(proc3.pid)
      expect(ns2Processes[0].pid).toBe(proc2.pid)

      // Cleanup
      proc1.kill('SIGKILL')
      proc2.kill('SIGKILL')
      proc3.kill('SIGKILL')
    })
  })

  describe('Edge Cases with Real Processes', () => {
    test('handles rapid spawn and kill cycles', async () => {
      const pids: number[] = []

      // Rapidly spawn and kill processes
      for (let i = 0; i < 5; i++) {
        const proc = manager.spawn('sleep', ['0.1'])
        pids.push(proc.pid!)
        spawnedPids.push(proc.pid!)

        // Kill immediately
        proc.kill('SIGKILL')
      }

      // Wait for all to exit
      await new Promise(resolve => setTimeout(resolve, 500))

      // All should be untracked
      const children = manager.listChildren()
      for (const pid of pids) {
        expect(children.some(p => p.pid === pid)).toBe(false)
      }
    })

    test('handles process that fails to start', async () => {
      // Try to spawn a non-existent command
      let errorThrown = false
      let proc: any

      try {
        proc = manager.spawn('this-command-does-not-exist-12345', ['arg'])
      } catch (error) {
        errorThrown = true
      }

      // Process spawn errors are async, so we need to wait
      if (proc?.pid) {
        spawnedPids.push(proc.pid)
      }

      // Should not crash the manager
      const children = manager.listChildren()
      expect(Array.isArray(children)).toBe(true)
    })

    test('concurrent cleanup calls are safe', async () => {
      // Spawn some processes
      const proc1 = manager.spawn('sleep', ['30'])
      const proc2 = manager.spawn('sleep', ['30'])
      spawnedPids.push(proc1.pid!, proc2.pid!)

      // Make them stale
      manager.track(proc1.pid!, {
        command: 'sleep',
        args: ['30'],
        namespace: 'loopwork',
        startTime: Date.now() - 20000
      })

      manager.track(proc2.pid!, {
        command: 'sleep',
        args: ['30'],
        namespace: 'loopwork',
        startTime: Date.now() - 20000
      })

      // Run multiple cleanup calls concurrently
      const results = await Promise.all([
        manager.cleanup(),
        manager.cleanup(),
        manager.cleanup()
      ])

      // All should succeed
      expect(results).toHaveLength(3)
      results.forEach(result => {
        expect(result.cleaned).toBeDefined()
        expect(result.failed).toBeDefined()
      })

      // Cleanup any survivors
      try {
        proc1.kill('SIGKILL')
        proc2.kill('SIGKILL')
      } catch {
        // Already killed
      }
    })
  })

  describe('Integration: Full Lifecycle', () => {
    test('complete lifecycle: spawn → track → persist → restart → cleanup', async () => {
      // Phase 1: Spawn and persist
      const proc = manager.spawn('sleep', ['60'])
      const pid = proc.pid!
      spawnedPids.push(pid)

      await manager.persist()

      // Phase 2: Simulate restart
      const newManager = createProcessManager({ storageDir: testDir })
      await newManager.load()

      // Verify process is tracked after restart
      expect(newManager.listChildren().some(p => p.pid === pid)).toBe(true)

      // Phase 3: Cleanup
      const result = await newManager.cleanup()

      // Process should NOT be cleaned (it's recent, parent alive)
      // So we manually kill it
      const killed = newManager.kill(pid, 'SIGTERM')
      expect(killed).toBe(true)

      // Wait for process to die
      await new Promise(resolve => setTimeout(resolve, 500))

      // Verify process is dead and untracked
      expect(() => process.kill(pid, 0)).toThrow()
      expect(newManager.listChildren().some(p => p.pid === pid)).toBe(false)
    })
  })
})
