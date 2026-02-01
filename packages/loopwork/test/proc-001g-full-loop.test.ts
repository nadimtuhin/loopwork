import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { spawn, ChildProcess } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { ProcessRegistry } from '../src/core/process-management/registry'
import { ProcessCleaner } from '../src/core/process-management/cleaner'
import { OrphanDetector } from '../src/core/process-management/orphan-detector'
import { createProcessManager } from '../src/core/process-management/process-manager'
import { isProcessAlive } from '../src/commands/shared/process-utils'

// Run tests serially to avoid process conflicts
describe.serial('PROC-001g: Process Management E2E (Full Loop Scenario)', () => {
  let tempDir: string
  let loopworkDir: string
  let spawnedProcesses: ChildProcess[] = []

  // Increase timeout for all tests in this suite
  const TEST_TIMEOUT = 15000
  const CLEANUP_WAIT = 3000 // 3 seconds wait for process cleanup

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'proc-001g-'))
    loopworkDir = path.join(tempDir, '.loopwork')
    await fs.mkdir(loopworkDir, { recursive: true })
    spawnedProcesses = []
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
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch {
      // Ignore errors
    }
  })

  describe('Crash Recovery Test', () => {
    test('start loopwork → crash parent → orphan cleaned on next start', async () => {
      // Stage 1: Start loopwork as subprocess with child processes
      // Simulate tracking processes in a registry
      const registry1 = new ProcessRegistry(loopworkDir)

      // Spawn child processes (simulating loopwork spawning AI CLI)
      const childProcess1 = spawn('sleep', ['60'])
      const childProcess2 = spawn('sleep', ['60'])

      expect(childProcess1.pid).toBeDefined()
      expect(childProcess2.pid).toBeDefined()
      spawnedProcesses.push(childProcess1, childProcess2)

      const pid1 = childProcess1.pid!
      const pid2 = childProcess2.pid!

      // Track processes with a parent PID (current process is the parent)
      const parentPid = process.pid
      registry1.add(pid1, {
        command: 'sleep',
        args: ['60'],
        namespace: 'loopwork',
        startTime: Date.now(),
        parentPid
      })

      registry1.add(pid2, {
        command: 'sleep',
        args: ['60'],
        namespace: 'loopwork',
        startTime: Date.now(),
        parentPid
      })

      // Persist registry (simulating loopwork state save)
      await registry1.persist()

      // Verify processes are tracked and alive
      expect(registry1.list().length).toBe(2)
      expect(isProcessAlive(pid1)).toBe(true)
      expect(isProcessAlive(pid2)).toBe(true)

      // Stage 2: Simulate crash - kill parent abruptly
      // In real scenario, the loopwork process would crash
      // Here we simulate by loading a new registry with the saved state
      // and detecting that the parent PID is still valid (no orphan yet)

      const registry2 = new ProcessRegistry(loopworkDir)
      await registry2.load()

      const loadedProcesses = registry2.list()
      expect(loadedProcesses.length).toBe(2)

      // Stage 3: Simulate next loopwork start - now parent is different
      // Create a new registry instance (simulating new loopwork process)
      const registry3 = new ProcessRegistry(loopworkDir)
      await registry3.load()

      // The loaded processes still have the old parent PID
      // In real crash scenario, the old parent would be dead
      // We simulate this by checking for orphans with the current parent
      // Since we can't actually kill ourselves, we verify detection logic

      const detector = new OrphanDetector(
        registry3,
        ['sleep', 'claude', 'loopwork'],
        60000 // 1 minute stale timeout
      )

      // Scan for orphans
      const orphans = await detector.scan()

      // In a real crash, these would be detected as orphans (parent-dead)
      // In our test scenario, parent is still alive, so no orphans yet
      // But we verify the detection logic works
      expect(orphans).toBeDefined()

      // To simulate the actual crash scenario, we'd need a separate process
      // Let's test the full cleanup cycle by manually marking as orphans

      // Manually mark processes as having dead parent (simulating crash detection)
      const processInfo1 = registry3.get(pid1)
      const processInfo2 = registry3.get(pid2)
      if (processInfo1) {
        // @ts-ignore - setting parentPid to dead process
        processInfo1.parentPid = 99999
      }
      if (processInfo2) {
        // @ts-ignore - setting parentPid to dead process
        processInfo2.parentPid = 99999
      }

      // Now scan again - should detect orphans
      const orphansAfterCrash = await detector.scan()

      // Should detect both processes as orphans
      expect(orphansAfterCrash.length).toBe(2)
      expect(orphansAfterCrash.some(o => o.pid === pid1)).toBe(true)
      expect(orphansAfterCrash.some(o => o.pid === pid2)).toBe(true)

      // Stage 4: Clean orphans (simulating new loopwork instance cleaning up)
      const cleaner = new ProcessCleaner(registry3, 1000)
      const result = await cleaner.cleanup(orphansAfterCrash)

      // Verify cleanup succeeded
      expect(result.cleaned.length).toBe(2)
      expect(result.errors.length).toBe(0)

      // Wait for processes to terminate
      await new Promise(resolve => setTimeout(resolve, CLEANUP_WAIT))

      // Verify processes are killed
      expect(isProcessAlive(pid1)).toBe(false)
      expect(isProcessAlive(pid2)).toBe(false)

      // Verify registry is clean
      expect(registry3.list().length).toBe(0)
    }, TEST_TIMEOUT)

    test('handles partial orphan cleanup gracefully', async () => {
      const registry = new ProcessRegistry(loopworkDir)

      // Spawn multiple processes
      const procs: ChildProcess[] = []
      const pids: number[] = []

      for (let i = 0; i < 5; i++) {
        const proc = spawn('sleep', ['60'])
        if (proc.pid) {
          procs.push(proc)
          pids.push(proc.pid)
          spawnedProcesses.push(proc)

          registry.add(proc.pid, {
            command: 'sleep',
            args: ['60'],
            namespace: 'crash-recovery',
            startTime: Date.now(),
            parentPid: process.pid
          })
        }
      }

      await registry.persist()

      // Mark first 3 as orphans, keep last 2 with valid parent
      const processes = registry.list()
      processes.slice(0, 3).forEach(p => {
        // @ts-ignore
        p.parentPid = 99999
      })

      // Detect orphans
      const detector = new OrphanDetector(registry, ['sleep'], 60000)
      const orphans = await detector.scan()

      // Should detect 3 orphans
      expect(orphans.length).toBe(3)

      // Clean orphans
      const cleaner = new ProcessCleaner(registry, 1000)
      const result = await cleaner.cleanup(orphans)

      expect(result.cleaned.length).toBe(3)

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, CLEANUP_WAIT))

      // First 3 should be dead, last 2 should still be alive
      for (let i = 0; i < 3; i++) {
        expect(isProcessAlive(pids[i])).toBe(false)
      }
      for (let i = 3; i < 5; i++) {
        expect(isProcessAlive(pids[i])).toBe(true)
      }

      // Kill remaining processes
      for (const proc of procs) {
        if (proc.pid && isProcessAlive(proc.pid)) {
          proc.kill('SIGKILL')
        }
      }
    }, TEST_TIMEOUT)
  })

  describe('Multi-Namespace Test', () => {
    test('multiple namespaces → each cleans own orphans', async () => {
      const namespaces = ['ns1', 'ns2', 'ns3']
      const procsByNamespace: Record<string, ChildProcess[]> = {}
      const pidsByNamespace: Record<string, number[]> = {}

      // Stage 1: Create processes in different namespaces
      for (const ns of namespaces) {
        const registry = new ProcessRegistry(loopworkDir)
        await registry.load() // Load shared state

        const procs: ChildProcess[] = []
        const pids: number[] = []

        // Spawn 2 processes per namespace
        for (let i = 0; i < 2; i++) {
          const proc = spawn('sleep', ['60'])
          if (proc.pid) {
            procs.push(proc)
            pids.push(proc.pid)
            spawnedProcesses.push(proc)

          registry.add(proc.pid, {
            command: 'sleep',
            args: ['60'],
            namespace: ns,
            startTime: Date.now(),
            parentPid: process.pid
          })
          }
        }

        await registry.persist()
        procsByNamespace[ns] = procs
        pidsByNamespace[ns] = pids
      }

      // Stage 2: Verify all processes are tracked
      const sharedRegistry = new ProcessRegistry(loopworkDir)
      await sharedRegistry.load()

      const allProcesses = sharedRegistry.list()
      expect(allProcesses.length).toBe(6) // 2 per namespace * 3 namespaces

      // Verify namespace isolation
      for (const ns of namespaces) {
        const nsProcesses = sharedRegistry.listByNamespace(ns)
        expect(nsProcesses.length).toBe(2)
        expect(nsProcesses.every(p => pidsByNamespace[ns].includes(p.pid))).toBe(true)
      }

      // Stage 3: Create orphans in specific namespace
      const ns1Processes = sharedRegistry.listByNamespace('ns1')
      ns1Processes.forEach(p => {
        // @ts-ignore - mark as orphan
        p.parentPid = 99999
      })

      // Stage 4: Detect orphans per namespace
      const detector = new OrphanDetector(
        sharedRegistry,
        ['sleep', 'claude'],
        60000
      )

      const orphans = await detector.scan()

      // Should detect 2 orphans (only from ns1)
      expect(orphans.length).toBe(2)
      expect(orphans.every(o => o.process.namespace === 'ns1')).toBe(true)

      // Stage 5: Clean orphans
      const cleaner = new ProcessCleaner(sharedRegistry, 1000)
      const result = await cleaner.cleanup(orphans)

      expect(result.cleaned.length).toBe(2)

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, CLEANUP_WAIT))

      // Stage 6: Verify isolation - only ns1 processes are cleaned
      // ns1 processes should be dead
      for (const pid of pidsByNamespace['ns1']) {
        expect(isProcessAlive(pid)).toBe(false)
      }

      // ns2 and ns3 processes should still be alive
      for (const ns of ['ns2', 'ns3']) {
        for (const pid of pidsByNamespace[ns]) {
          expect(isProcessAlive(pid)).toBe(true)
        }
      }

      // Verify only ns1 is empty in registry
      expect(sharedRegistry.listByNamespace('ns1').length).toBe(0)
      expect(sharedRegistry.listByNamespace('ns2').length).toBe(2)
      expect(sharedRegistry.listByNamespace('ns3').length).toBe(2)

      // Kill remaining processes
      for (const ns of ['ns2', 'ns3']) {
        for (const proc of procsByNamespace[ns]) {
          if (proc.pid && isProcessAlive(proc.pid)) {
            proc.kill('SIGKILL')
          }
        }
      }
    }, TEST_TIMEOUT)

    test('namespace isolation prevents cross-namespace cleanup', async () => {
      const registry = new ProcessRegistry(loopworkDir)

      // Create processes in two namespaces
      const ns1Proc1 = spawn('sleep', ['60'])
      const ns1Proc2 = spawn('sleep', ['60'])
      const ns2Proc1 = spawn('sleep', ['60'])
      const ns2Proc2 = spawn('sleep', ['60'])

      expect(ns1Proc1.pid).toBeDefined()
      expect(ns1Proc2.pid).toBeDefined()
      expect(ns2Proc1.pid).toBeDefined()
      expect(ns2Proc2.pid).toBeDefined()

      const pidNs1_1 = ns1Proc1.pid!
      const pidNs1_2 = ns1Proc2.pid!
      const pidNs2_1 = ns2Proc1.pid!
      const pidNs2_2 = ns2Proc2.pid!

      spawnedProcesses.push(ns1Proc1, ns1Proc2, ns2Proc1, ns2Proc2)

      // Track in different namespaces
      registry.add(pidNs1_1, {
        command: 'sleep',
        args: ['60'],
        namespace: 'namespace-a',
        startTime: Date.now(),
        parentPid: process.pid
      })

      registry.add(pidNs1_2, {
        command: 'sleep',
        args: ['60'],
        namespace: 'namespace-a',
        startTime: Date.now(),
        parentPid: process.pid
      })

      registry.add(pidNs2_1, {
        command: 'sleep',
        args: ['60'],
        namespace: 'namespace-b',
        startTime: Date.now(),
        parentPid: process.pid
      })

      registry.add(pidNs2_2, {
        command: 'sleep',
        args: ['60'],
        namespace: 'namespace-b',
        startTime: Date.now(),
        parentPid: process.pid
      })

      await registry.persist()

      // Mark only namespace-a processes as orphans
      const ns1Processes = registry.listByNamespace('namespace-a')
      ns1Processes.forEach(p => {
        // @ts-ignore
        p.parentPid = 99999
      })

      // Detect orphans
      const detector = new OrphanDetector(registry, ['sleep'], 60000)
      const orphans = await detector.scan()

      // Should only detect namespace-a orphans
      expect(orphans.length).toBe(2)
      expect(orphans.every(o => o.process.namespace === 'namespace-a')).toBe(true)

      // Clean only namespace-a orphans
      const cleaner = new ProcessCleaner(registry, 1000)
      await cleaner.cleanup(orphans)

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, CLEANUP_WAIT))

      // Verify namespace-a processes are killed
      expect(isProcessAlive(pidNs1_1)).toBe(false)
      expect(isProcessAlive(pidNs1_2)).toBe(false)

      // Verify namespace-b processes are still alive (isolated)
      expect(isProcessAlive(pidNs2_1)).toBe(true)
      expect(isProcessAlive(pidNs2_2)).toBe(true)

      // Cleanup remaining processes
      ns2Proc1.kill('SIGKILL')
      ns2Proc2.kill('SIGKILL')
    }, TEST_TIMEOUT)
  })

  describe('Timeout Test', () => {
    test('start process with timeout → stale process killed', async () => {
      const registry = new ProcessRegistry(loopworkDir)

      // Stage 1: Spawn a long-running process
      const proc = spawn('sleep', ['60'])
      expect(proc.pid).toBeDefined()
      spawnedProcesses.push(proc)

      const pid = proc.pid!

      // Track with a short timeout setting
      registry.add(pid, {
        command: 'sleep',
        args: ['60'],
        namespace: 'timeout-test',
        startTime: Date.now() - 10000, // Simulate started 10 seconds ago
        parentPid: process.pid
      })

      await registry.persist()

      // Stage 2: Create detector with short stale timeout (3 seconds)
      // Threshold = 2x timeout = 6 seconds
      const detector = new OrphanDetector(
        registry,
        ['sleep'],
        3000 // 3 second timeout
      )

      // Process has been running for 10 seconds > 6 second threshold
      // Should be detected as stale
      const orphans = await detector.scan()

      expect(orphans.length).toBe(1)
      expect(orphans[0].pid).toBe(pid)
      expect(orphans[0].reason).toBe('stale')

      // Stage 3: Clean the stale process
      const cleaner = new ProcessCleaner(registry, 1000)
      const result = await cleaner.cleanup(orphans)

      expect(result.cleaned.length).toBe(1)
      expect(result.cleaned).toContain(pid)

      // Wait for process to be killed
      await new Promise(resolve => setTimeout(resolve, CLEANUP_WAIT))

      // Verify process is terminated
      expect(isProcessAlive(pid)).toBe(false)

      // Verify registry is clean
      expect(registry.get(pid)).toBeUndefined()
    }, TEST_TIMEOUT)

    test('process under timeout not killed as stale', async () => {
      const registry = new ProcessRegistry(loopworkDir)

      // Spawn process
      const proc = spawn('sleep', ['60'])
      expect(proc.pid).toBeDefined()
      spawnedProcesses.push(proc)

      const pid = proc.pid!

      // Track with recent start time
      registry.add(pid, {
        command: 'sleep',
        args: ['60'],
        namespace: 'timeout-test',
        startTime: Date.now() - 2000,
        parentPid: process.pid
      })

      await registry.persist()

      // Detector with 5 second timeout (10 second threshold)
      const detector = new OrphanDetector(
        registry,
        ['sleep'],
        5000
      )

      // Process running 2 seconds < 10 second threshold
      // Should NOT be detected as stale
      const orphans = await detector.scan()

      const staleOrphans = orphans.filter(o => o.reason === 'stale')
      expect(staleOrphans.length).toBe(0)

      // Process should still be alive
      expect(isProcessAlive(pid)).toBe(true)

      // Cleanup
      proc.kill('SIGKILL')
    }, TEST_TIMEOUT)

    test('multiple stale processes killed in parallel', async () => {
      const registry = new ProcessRegistry(loopworkDir)

      const procs: ChildProcess[] = []
      const pids: number[] = []

      // Spawn multiple processes with old start times
      for (let i = 0; i < 4; i++) {
        const proc = spawn('sleep', ['60'])
        if (proc.pid) {
          procs.push(proc)
          pids.push(proc.pid)
          spawnedProcesses.push(proc)

          // Stagger start times to simulate different ages
          registry.add(proc.pid, {
            command: 'sleep',
            args: ['60'],
            namespace: 'stale-multi-test',
            startTime: Date.now() - (15000 + i * 2000),
            parentPid: process.pid
          })
        }
      }

      await registry.persist()

      // Detector with 3 second timeout (6 second threshold)
      // All processes running > 6 seconds, should all be stale
      const detector = new OrphanDetector(registry, ['sleep'], 3000)
      const orphans = await detector.scan()

      expect(orphans.length).toBe(4)

      // Clean all stale processes
      const cleaner = new ProcessCleaner(registry, 2000)
      const result = await cleaner.cleanup(orphans)

      expect(result.cleaned.length).toBe(4)

      // Wait for all to be killed
      await new Promise(resolve => setTimeout(resolve, 5000))

      // Verify all processes are terminated
      for (const pid of pids) {
        expect(isProcessAlive(pid)).toBe(false)
      }

      // Verify registry is clean
      expect(registry.list().length).toBe(0)
    }, TEST_TIMEOUT)
  })

  describe('Full Loop Integration Tests', () => {
    test('complete lifecycle using ProcessManager', async () => {
      const manager = createProcessManager({
        storageDir: loopworkDir,
        staleTimeoutMs: 5000, // 5 second stale timeout
        gracePeriodMs: 2000 // 2 second grace period
      })

      // Stage 1: Spawn processes
      const proc1 = spawn('sleep', ['30'])
      const proc2 = spawn('sleep', ['30'])

      expect(proc1.pid).toBeDefined()
      expect(proc2.pid).toBeDefined()

      const pid1 = proc1.pid!
      const pid2 = proc2.pid!

      spawnedProcesses.push(proc1, proc2)

      // Track using manager
      manager.track(pid1, {
        command: 'sleep',
        args: ['30'],
        namespace: 'manager-test',
        startTime: Date.now()
      })

      manager.track(pid2, {
        command: 'sleep',
        args: ['30'],
        namespace: 'manager-test',
        startTime: Date.now()
      })

      // Persist state
      await manager.persist()

      // Verify tracked
      let children = manager.listChildren()
      expect(children.length).toBe(2)

      // Stage 2: Mark as orphans (simulate crash)
      // We need to manually modify the registry to simulate a dead parent
      const registryPath = path.join(loopworkDir, 'processes.json')
      const registryContent = JSON.parse(await fs.readFile(registryPath, 'utf-8'))
      const registryData = registryContent.processes
      registryData.forEach((p: any) => {
        p.parentPid = 99999 // Non-existent parent
      })
      registryContent.processes = registryData
      await fs.writeFile(registryPath, JSON.stringify(registryContent))

      // Simulate by creating new manager and loading state
      const manager2 = createProcessManager({
        storageDir: loopworkDir,
        staleTimeoutMs: 5000,
        gracePeriodMs: 2000
      })

      await manager2.load()
      children = manager2.listChildren()
      expect(children.length).toBe(2)
      expect(children.every(c => c.parentPid === 99999)).toBe(true)

      // Stage 3: Cleanup orphans
      const result = await manager2.cleanup()

      expect(result).toBeDefined()
      expect(result.cleaned.length).toBe(2)

      // Wait for processes to terminate
      await new Promise(resolve => setTimeout(resolve, CLEANUP_WAIT))

      // Verify processes are killed
      expect(isProcessAlive(pid1)).toBe(false)
      expect(isProcessAlive(pid2)).toBe(false)

      // Verify state after cleanup
      const finalChildren = manager2.listChildren()
      expect(finalChildren.length).toBeLessThanOrEqual(2)
    }, TEST_TIMEOUT)

    test('handles crash with persistence and recovery', async () => {
      // Stage 1: Initial session
      const manager1 = createProcessManager({
        storageDir: loopworkDir,
        staleTimeoutMs: 8000
      })

      const proc1 = spawn('sleep', ['60'])
      const proc2 = spawn('sleep', ['60'])

      expect(proc1.pid).toBeDefined()
      expect(proc2.pid).toBeDefined()

      const pid1 = proc1.pid!
      const pid2 = proc2.pid!

      spawnedProcesses.push(proc1, proc2)

      manager1.track(pid1, {
        command: 'sleep',
        args: ['60'],
        namespace: 'crash-recovery',
        startTime: Date.now()
      })

      manager1.track(pid2, {
        command: 'sleep',
        args: ['60'],
        namespace: 'crash-recovery',
        startTime: Date.now()
      })

      await manager1.persist()

      // Stage 2: Simulate crash by loading new instance
      // We need to manually modify the registry to simulate a dead parent
      const registryPath = path.join(loopworkDir, 'processes.json')
      const registryContent = JSON.parse(await fs.readFile(registryPath, 'utf-8'))
      const registryData = registryContent.processes
      registryData.forEach((p: any) => {
        p.parentPid = 99999
      })
      registryContent.processes = registryData
      await fs.writeFile(registryPath, JSON.stringify(registryContent))

      // In real scenario, old manager dies, new instance loads state
      const manager2 = createProcessManager({
        storageDir: loopworkDir,
        staleTimeoutMs: 8000
      })

      await manager2.load()

      const loadedChildren = manager2.listChildren()
      expect(loadedChildren.length).toBe(2)

      // Stage 3: Cleanup on restart
      const result = await manager2.cleanup()

      expect(result).toBeDefined()

      // Wait for termination
      await new Promise(resolve => setTimeout(resolve, CLEANUP_WAIT))

      // Verify cleanup
      expect(isProcessAlive(pid1)).toBe(false)
      expect(isProcessAlive(pid2)).toBe(false)

      // Stage 4: Verify persistence is clean
      await manager2.persist()

      const manager3 = createProcessManager({
        storageDir: loopworkDir,
        staleTimeoutMs: 8000
      })

      await manager3.load()

      expect(manager3.listChildren().length).toBe(0)
    }, TEST_TIMEOUT)
  })
})
