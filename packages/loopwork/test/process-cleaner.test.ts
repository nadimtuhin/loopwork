import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import { ProcessCleaner } from '../src/core/process-management/cleaner'
import { ProcessRegistry } from '../src/core/process-management/registry'
import type { OrphanInfo, ProcessInfo } from '../src/contracts/process-manager'

// Helper to create orphan info
function createOrphanInfo(pid: number, reason: 'parent-dead' | 'untracked' | 'stale'): OrphanInfo {
  const processInfo: ProcessInfo = {
    pid,
    command: 'test-command',
    args: [],
    namespace: 'test',
    startTime: Date.now(),
    status: 'orphaned'
  }
  return { pid, reason, process: processInfo }
}

// Mock process.kill for testing
let mockProcessKillCalls: Array<{ pid: number; signal: string | number }> = []
let mockProcessAliveMap: Map<number, boolean> = new Map()

const originalProcessKill = process.kill

function setupProcessKillMock() {
  mockProcessKillCalls = []
  mockProcessAliveMap = new Map()

  // @ts-ignore - Mocking process.kill
  process.kill = (pid: number, signal: string | number = 0) => {
    mockProcessKillCalls.push({ pid, signal })

    if (signal === 0) {
      // Signal 0 is checking if process exists
      const isAlive = mockProcessAliveMap.get(pid) ?? false
      if (!isAlive) {
        const err = new Error('Process not found') as NodeJS.ErrnoException
        err.code = 'ESRCH'
        throw err
      }
      return true
    }

    if (signal === 'SIGTERM') {
      // SIGTERM - process might still be alive
      return true
    }

    if (signal === 'SIGKILL') {
      // SIGKILL - process is now dead
      mockProcessAliveMap.set(pid, false)
      return true
    }

    return true
  }
}

function restoreProcessKill() {
  // @ts-ignore
  process.kill = originalProcessKill
}

describe('ProcessCleaner', () => {
  let registry: ProcessRegistry
  let cleaner: ProcessCleaner
  const testRegistryPath = '.test-process-cleaner-registry'

  beforeEach(async () => {
    // Clean up test registry directory
    await Bun.$`rm -rf ${testRegistryPath}`.nothrow()
    await Bun.$`mkdir -p ${testRegistryPath}`

    registry = new ProcessRegistry(testRegistryPath)
    cleaner = new ProcessCleaner(registry, 100) // Short grace period for tests

    setupProcessKillMock()
  })

  afterEach(async () => {
    restoreProcessKill()
    await Bun.$`rm -rf ${testRegistryPath}`.nothrow()
  })

  describe('cleanup', () => {
    test('cleans up single orphan process', async () => {
      const orphan = createOrphanInfo(12345, 'parent-dead')

      // Register the process
      registry.add(orphan.pid, {
        command: 'test',
        args: [],
        namespace: 'test',
        startTime: Date.now()
      })

      // Mark as alive initially
      mockProcessAliveMap.set(12345, true)

      const result = await cleaner.cleanup([orphan])

      expect(result.cleaned).toContain(12345)
      expect(result.failed).toHaveLength(0)
      expect(result.errors).toHaveLength(0)

      // Verify SIGTERM was sent
      expect(mockProcessKillCalls.some(c => c.pid === 12345 && c.signal === 'SIGTERM')).toBe(true)
    })

    test('cleans up multiple orphan processes in parallel', async () => {
      const orphans = [
        createOrphanInfo(11111, 'parent-dead'),
        createOrphanInfo(22222, 'untracked'),
        createOrphanInfo(33333, 'stale')
      ]

      orphans.forEach(orphan => {
        registry.add(orphan.pid, {
          command: 'test',
          args: [],
          namespace: 'test',
          startTime: Date.now()
        })
        mockProcessAliveMap.set(orphan.pid, true)
      })

      const result = await cleaner.cleanup(orphans)

      expect(result.cleaned).toHaveLength(3)
      expect(result.cleaned).toContain(11111)
      expect(result.cleaned).toContain(22222)
      expect(result.cleaned).toContain(33333)
      expect(result.failed).toHaveLength(0)
    })

    test('handles already-dead processes gracefully', async () => {
      const orphan = createOrphanInfo(99999, 'parent-dead')

      registry.add(orphan.pid, {
        command: 'test',
        args: [],
        namespace: 'test',
        startTime: Date.now()
      })

      // Process is already dead
      mockProcessAliveMap.set(99999, false)

      const result = await cleaner.cleanup([orphan])

      expect(result.cleaned).toContain(99999)
      expect(result.failed).toHaveLength(0)
    })

    test('handles empty orphan list', async () => {
      const result = await cleaner.cleanup([])

      expect(result.cleaned).toHaveLength(0)
      expect(result.failed).toHaveLength(0)
      expect(result.errors).toHaveLength(0)
    })

    test('records failures when kill fails', async () => {
      const orphan = createOrphanInfo(44444, 'parent-dead')

      registry.add(orphan.pid, {
        command: 'test',
        args: [],
        namespace: 'test',
        startTime: Date.now()
      })

      // Mock process.kill to throw EPERM
      // @ts-ignore
      process.kill = (pid: number, signal: string | number) => {
        if (signal === 0) {
          return true // Process exists
        }
        const err = new Error('Permission denied') as NodeJS.ErrnoException
        err.code = 'EPERM'
        throw err
      }

      const result = await cleaner.cleanup([orphan])

      expect(result.cleaned).toHaveLength(0)
      expect(result.failed).toContain(44444)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].error).toContain('Permission denied')
    })

    test('updates registry after successful cleanup', async () => {
      const orphan = createOrphanInfo(55555, 'stale')

      registry.add(orphan.pid, {
        command: 'test',
        args: [],
        namespace: 'test',
        startTime: Date.now()
      })
      mockProcessAliveMap.set(55555, true)

      // Verify process is in registry
      expect(registry.list().some(p => p.pid === 55555)).toBe(true)

      await cleaner.cleanup([orphan])

      // Process should be removed from registry
      expect(registry.list().some(p => p.pid === 55555)).toBe(false)
    })
  })

  describe('gracefulKill', () => {
    test('terminates process with SIGTERM if it exits gracefully', async () => {
      const pid = 77777
      mockProcessAliveMap.set(pid, true)

      // Process will die after SIGTERM
      // @ts-ignore
      process.kill = (testPid: number, signal: string | number) => {
        mockProcessKillCalls.push({ pid: testPid, signal })

        if (signal === 0) {
          const isAlive = mockProcessAliveMap.get(testPid) ?? false
          if (!isAlive) {
            const err = new Error('Process not found') as NodeJS.ErrnoException
            err.code = 'ESRCH'
            throw err
          }
          return true
        }

        if (signal === 'SIGTERM') {
          // Simulate process dying gracefully
          setTimeout(() => mockProcessAliveMap.set(testPid, false), 50)
          return true
        }

        return true
      }

      const result = await cleaner.gracefulKill(pid)

      expect(result).toBe(true)
      expect(mockProcessKillCalls.some(c => c.pid === pid && c.signal === 'SIGTERM')).toBe(true)
      // SIGKILL should not be needed
      expect(mockProcessKillCalls.some(c => c.pid === pid && c.signal === 'SIGKILL')).toBe(false)
    })

    test('falls back to SIGKILL if process survives SIGTERM', async () => {
      const pid = 88888
      mockProcessAliveMap.set(pid, true)

      // Process survives SIGTERM but dies from SIGKILL
      // @ts-ignore
      process.kill = (testPid: number, signal: string | number) => {
        mockProcessKillCalls.push({ pid: testPid, signal })

        if (signal === 0) {
          const isAlive = mockProcessAliveMap.get(testPid) ?? false
          if (!isAlive) {
            const err = new Error('Process not found') as NodeJS.ErrnoException
            err.code = 'ESRCH'
            throw err
          }
          return true
        }

        if (signal === 'SIGTERM') {
          // Process survives SIGTERM
          return true
        }

        if (signal === 'SIGKILL') {
          // Process dies from SIGKILL
          mockProcessAliveMap.set(testPid, false)
          return true
        }

        return true
      }

      const result = await cleaner.gracefulKill(pid)

      expect(result).toBe(true)
      expect(mockProcessKillCalls.some(c => c.pid === pid && c.signal === 'SIGTERM')).toBe(true)
      expect(mockProcessKillCalls.some(c => c.pid === pid && c.signal === 'SIGKILL')).toBe(true)
    })

    test('returns true if process already dead', async () => {
      const pid = 66666
      mockProcessAliveMap.set(pid, false)

      const result = await cleaner.gracefulKill(pid)

      expect(result).toBe(true)
      // Process check (signal 0) will be sent, but no SIGTERM/SIGKILL
      expect(mockProcessKillCalls.filter(c => c.pid === pid && c.signal === 'SIGTERM')).toHaveLength(0)
      expect(mockProcessKillCalls.filter(c => c.pid === pid && c.signal === 'SIGKILL')).toHaveLength(0)
    })

    test('handles ESRCH error gracefully', async () => {
      const pid = 11111

      // Process doesn't exist - throw ESRCH
      // @ts-ignore
      process.kill = (testPid: number, signal: string | number) => {
        const err = new Error('Process not found') as NodeJS.ErrnoException
        err.code = 'ESRCH'
        throw err
      }

      const result = await cleaner.gracefulKill(pid)

      expect(result).toBe(true) // ESRCH treated as success
    })

    test('throws on EPERM error', async () => {
      const pid = 22222
      mockProcessAliveMap.set(pid, true)

      // Permission denied
      // @ts-ignore
      process.kill = (testPid: number, signal: string | number) => {
        if (signal === 0) return true
        const err = new Error('Permission denied') as NodeJS.ErrnoException
        err.code = 'EPERM'
        throw err
      }

      await expect(cleaner.gracefulKill(pid)).rejects.toThrow('Permission denied')
    })
  })

  describe('forceKill', () => {
    test('kills process immediately with SIGKILL', () => {
      const pid = 33333
      mockProcessAliveMap.set(pid, true)

      const result = cleaner.forceKill(pid)

      expect(result).toBe(true)
      expect(mockProcessKillCalls.some(c => c.pid === pid && c.signal === 'SIGKILL')).toBe(true)
    })

    test('returns false if process does not exist', () => {
      const pid = 44444
      mockProcessAliveMap.set(pid, false)

      // Need to mock SIGKILL to throw ESRCH for non-existent process
      // @ts-ignore
      process.kill = (testPid: number, signal: string | number) => {
        mockProcessKillCalls.push({ pid: testPid, signal })

        if (signal === 'SIGKILL') {
          const isAlive = mockProcessAliveMap.get(testPid) ?? false
          if (!isAlive) {
            const err = new Error('Process not found') as NodeJS.ErrnoException
            err.code = 'ESRCH'
            throw err
          }
          mockProcessAliveMap.set(testPid, false)
          return true
        }

        return true
      }

      const result = cleaner.forceKill(pid)

      expect(result).toBe(false)
    })

    test('throws on EPERM error', () => {
      const pid = 55555
      mockProcessAliveMap.set(pid, true)

      // Permission denied
      // @ts-ignore
      process.kill = (testPid: number, signal: string | number) => {
        if (signal === 0) return true
        const err = new Error('Permission denied') as NodeJS.ErrnoException
        err.code = 'EPERM'
        throw err
      }

      expect(() => cleaner.forceKill(pid)).toThrow('Permission denied')
    })
  })

  describe('grace period', () => {
    test('waits for grace period before SIGKILL', async () => {
      const pid = 99999
      mockProcessAliveMap.set(pid, true)

      const startTime = Date.now()

      // Process survives SIGTERM
      // @ts-ignore
      process.kill = (testPid: number, signal: string | number) => {
        mockProcessKillCalls.push({ pid: testPid, signal })

        if (signal === 0) {
          const isAlive = mockProcessAliveMap.get(testPid) ?? false
          if (!isAlive) {
            const err = new Error('Process not found') as NodeJS.ErrnoException
            err.code = 'ESRCH'
            throw err
          }
          return true
        }

        if (signal === 'SIGKILL') {
          mockProcessAliveMap.set(testPid, false)
        }

        return true
      }

      await cleaner.gracefulKill(pid)

      const elapsed = Date.now() - startTime

      // Should wait at least the grace period (100ms in test)
      expect(elapsed).toBeGreaterThanOrEqual(100)
    })

    test('respects custom grace period', async () => {
      const customCleaner = new ProcessCleaner(registry, 200) // 200ms grace period
      const pid = 11111
      mockProcessAliveMap.set(pid, true)

      const startTime = Date.now()

      // Process survives SIGTERM
      // @ts-ignore
      process.kill = (testPid: number, signal: string | number) => {
        if (signal === 0) {
          const isAlive = mockProcessAliveMap.get(testPid) ?? false
          if (!isAlive) {
            const err = new Error('Process not found') as NodeJS.ErrnoException
            err.code = 'ESRCH'
            throw err
          }
          return true
        }

        if (signal === 'SIGKILL') {
          mockProcessAliveMap.set(testPid, false)
        }

        return true
      }

      await customCleaner.gracefulKill(pid)

      const elapsed = Date.now() - startTime

      // Should wait at least the custom grace period (200ms)
      expect(elapsed).toBeGreaterThanOrEqual(200)
    })
  })
})
