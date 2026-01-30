import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import { list, clean } from '../../src/commands/processes'

describe('processes command', () => {
  describe('list', () => {
    test('should list running processes', async () => {
      const mockMonitor = {
        getRunningProcesses: () => [
          {
            namespace: 'default',
            pid: 12345,
            startedAt: new Date().toISOString(),
            logFile: '/path/to/log.txt',
            args: ['--cli', 'claude'],
          },
        ],
      }

      const mockLogger = {
        info: mock(),
        raw: mock(),
        success: mock(),
        error: mock(),
        warn: mock(),
      }

      const mockFindProjectRoot = () => '/project'

      await list(
        { json: false },
        {
          MonitorClass: class {
            constructor() {
              return mockMonitor
            }
          } as any,
          logger: mockLogger as any,
          findProjectRoot: mockFindProjectRoot as any,
        }
      )

      expect(mockLogger.info).toHaveBeenCalledWith('Loopwork Processes (1 running)\n')
    })

    test('should output JSON when requested', async () => {
      const mockMonitor = {
        getRunningProcesses: () => [
          {
            namespace: 'prod',
            pid: 54321,
            startedAt: '2024-01-31T12:00:00.000Z',
            logFile: '/path/to/log.txt',
            args: [],
          },
        ],
      }

      const mockLogger = {
        raw: mock(),
        info: mock(),
      }

      const mockFindProjectRoot = () => '/project'

      await list(
        { json: true },
        {
          MonitorClass: class {
            constructor() {
              return mockMonitor
            }
          } as any,
          logger: mockLogger as any,
          findProjectRoot: mockFindProjectRoot as any,
        }
      )

      expect(mockLogger.raw).toHaveBeenCalled()
      const callArgs = (mockLogger.raw as any).mock.calls[0][0]
      expect(callArgs).toContain('prod')
      expect(callArgs).toContain('54321')
    })

    test('should show message when no processes running', async () => {
      const mockMonitor = {
        getRunningProcesses: () => [],
      }

      const mockLogger = {
        info: mock(),
      }

      const mockFindProjectRoot = () => '/project'

      await list(
        { json: false },
        {
          MonitorClass: class {
            constructor() {
              return mockMonitor
            }
          } as any,
          logger: mockLogger as any,
          findProjectRoot: mockFindProjectRoot as any,
        }
      )

      expect(mockLogger.info).toHaveBeenCalledWith('No loopwork processes running')
    })

    test('should filter by namespace', async () => {
      const mockMonitor = {
        getRunningProcesses: () => [
          {
            namespace: 'default',
            pid: 12345,
            startedAt: new Date().toISOString(),
            logFile: '/path/to/log1.txt',
            args: [],
          },
          {
            namespace: 'prod',
            pid: 54321,
            startedAt: new Date().toISOString(),
            logFile: '/path/to/log2.txt',
            args: [],
          },
        ],
      }

      const mockLogger = {
        info: mock(),
        raw: mock(),
      }

      const mockFindProjectRoot = () => '/project'

      await list(
        { json: false, namespace: 'prod' },
        {
          MonitorClass: class {
            constructor() {
              return mockMonitor
            }
          } as any,
          logger: mockLogger as any,
          findProjectRoot: mockFindProjectRoot as any,
        }
      )

      expect(mockLogger.info).toHaveBeenCalledWith('Loopwork Processes (1 running)\n')
    })
  })

  describe('clean', () => {
    test('should report no orphans when none found', async () => {
      const mockLogger = {
        info: mock(),
        raw: mock(),
        success: mock(),
      }

      const mockFindProjectRoot = () => '/project'
      const mockDetectOrphans = async () => []

      await clean(
        { json: false, force: false, dryRun: false },
        {
          logger: mockLogger as any,
          findProjectRoot: mockFindProjectRoot as any,
          detectOrphans: mockDetectOrphans as any,
        }
      )

      expect(mockLogger.success).toHaveBeenCalledWith('No orphan processes found')
    })

    test('should output JSON when requested', async () => {
      const mockLogger = {
        raw: mock(),
      }

      const mockFindProjectRoot = () => '/project'
      const mockDetectOrphans = async () => []

      await clean(
        { json: true, force: false, dryRun: false },
        {
          logger: mockLogger as any,
          findProjectRoot: mockFindProjectRoot as any,
          detectOrphans: mockDetectOrphans as any,
        }
      )

      expect(mockLogger.raw).toHaveBeenCalled()
      const callArgs = (mockLogger.raw as any).mock.calls[0][0]
      const parsed = JSON.parse(callArgs)
      expect(parsed.orphans).toEqual([])
      expect(parsed.summary.killed).toBe(0)
    })

    test('should show orphans found', async () => {
      const mockOrphanKiller = {
        kill: async () => ({
          killed: [1234],
          skipped: [],
          failed: [],
        }),
      }

      const mockLogger = {
        info: mock(),
        raw: mock(),
        success: mock(),
        error: mock(),
        warn: mock(),
      }

      const mockFindProjectRoot = () => '/project'
      const mockDetectOrphans = async () => [
        {
          pid: 1234,
          command: 'bun run',
          age: 5000,
          classification: 'confirmed',
          reason: 'process running in stale directory',
          cwd: '/old/path',
        },
      ]

      await clean(
        { json: false, force: false, dryRun: false },
        {
          logger: mockLogger as any,
          findProjectRoot: mockFindProjectRoot as any,
          detectOrphans: mockDetectOrphans as any,
          OrphanKillerClass: class {
            constructor() {
              return mockOrphanKiller
            }
          } as any,
        }
      )

      expect(mockLogger.info).toHaveBeenCalledWith('\nOrphan Processes Found:\n')
      expect(mockLogger.success).toHaveBeenCalledWith('Killed: 1, Skipped: 0')
    })
  })
})
