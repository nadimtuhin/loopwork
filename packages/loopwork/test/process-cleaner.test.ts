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
      const isAlive = mockProcessAliveMap.get(pid) ?? false
      if (!isAlive) {
        const err = new Error('Process not found') as NodeJS.ErrnoException
        err.code = 'ESRCH'
        throw err
      }
      return true
    }

    if (signal === 'SIGTERM') {
      return true
    }

    if (signal === 'SIGKILL') {
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
    await Bun.$`rm -rf ${testRegistryPath}`.nothrow()
    await Bun.$`mkdir -p ${testRegistryPath}`

    registry = new ProcessRegistry(testRegistryPath)
    cleaner = new ProcessCleaner(registry)

    setupProcessKillMock()
  })

  afterEach(async () => {
    restoreProcessKill()
    await Bun.$`rm -rf ${testRegistryPath}`.nothrow()
  })

  describe('cleanup', () => {
    test('cleans up single orphan process', async () => {
      const orphan = createOrphanInfo(12345, 'parent-dead')

      registry.add(orphan.pid, {
        command: 'test',
        args: [],
        namespace: 'test',
        startTime: Date.now()
      })

      mockProcessAliveMap.set(12345, true)

      const result = await cleaner.cleanup([orphan])

      expect(result.cleaned).toContain(12345)
      expect(result.failed).toHaveLength(0)
      expect(result.alreadyGone).toHaveLength(0)

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

      mockProcessAliveMap.set(99999, false)

      const result = await cleaner.cleanup([orphan])

      expect(result.cleaned).toContain(99999)
      expect(result.failed).toHaveLength(0)
      expect(result.alreadyGone).toContain(99999)
    })

    test('handles empty orphan list', async () => {
      const result = await cleaner.cleanup([])

      expect(result.cleaned).toHaveLength(0)
      expect(result.failed).toHaveLength(0)
      expect(result.alreadyGone).toHaveLength(0)
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
          return true
        }
        const err = new Error('Permission denied') as NodeJS.ErrnoException
        err.code = 'EPERM'
        throw err
      }

      const result = await cleaner.cleanup([orphan])

      expect(result.cleaned).toHaveLength(0)
      expect(result.failed).toHaveLength(1)
      expect(result.failed[0].pid).toBe(44444)
      expect(result.failed[0].error).toContain('Permission denied')
      expect(result.alreadyGone).toHaveLength(0)
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

      expect(registry.list().some(p => p.pid === 55555)).toBe(true)

      await cleaner.cleanup([orphan])

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
          setTimeout(() => mockProcessAliveMap.set(testPid, false), 50)
          return true
        }

        return true
      }

      const result = await cleaner.gracefulKill(pid)

      expect(result).toBe(true)
      expect(mockProcessKillCalls.some(c => c.pid === pid && c.signal === 'SIGTERM')).toBe(true)
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
          return true
        }

        if (signal === 'SIGKILL') {
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

      expect(result).toBe(true)
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
})
