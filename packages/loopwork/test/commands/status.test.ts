import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { status, type StatusDeps } from '../../src/commands/status'
import type { ProcessInfo } from '../../src/contracts/process-manager'

describe('status command', () => {
  let tempDir: string
  let loopworkDir: string
  let processesFile: string
  let monitorStateFile: string
  let originalCwd: string

  // Mock process that captures stdout
  const createProcess = () => {
    const output = { text: '' }
    const proc = {
      ...process,
      stdout: {
        ...process.stdout,
        write: ((chunk: any) => {
          output.text += typeof chunk === 'string' ? chunk : chunk.toString()
          return true
        }) as any,
      },
    }
    return { proc, output }
  }

  // Create StatusDeps with mocks
  const createDeps = (
    proc: NodeJS.Process,
    mockMonitor: any,
    mockIsProcessAlive: (pid: number) => boolean = () => true,
    output?: { text: string }
  ): StatusDeps => {
    const chalk = require('chalk').default

    // Create a custom logger that writes to the captured output
    const mockLogger = output ? {
      raw: (msg: string) => {
        output.text += msg + '\n'
      }
    } as typeof logger : undefined

    return {
      MonitorClass: class {
        getStatus() {
          return mockMonitor.getStatus()
        }
      } as any,
      process: proc,
      fs: {
        existsSync: (p: string) => fs.existsSync(p),
        readFileSync: (p: string, encoding: string) => fs.readFileSync(p, encoding),
      },
      path: {
        join: (...paths: string[]) => path.join(...paths),
        basename: (p: string) => path.basename(p),
      },
      isProcessAlive: mockIsProcessAlive,
      formatUptime: (date: string) => {
        const start = new Date(date).getTime()
        const now = Date.now()
        const diff = now - start
        const minutes = Math.floor(diff / 1000 / 60)
        const seconds = Math.floor((diff / 1000) % 60)
        return `${minutes}m ${seconds}s`
      },
      formatDuration: (ms: number) => {
        const seconds = Math.floor(ms / 1000)
        const minutes = Math.floor(seconds / 60)
        const hours = Math.floor(minutes / 60)
        if (hours > 0) {
          return `${hours}h ${minutes % 60}m ${seconds % 60}s`
        }
        if (minutes > 0) {
          return `${minutes}m ${seconds % 60}s`
        }
        return `${seconds}s`
      },
      cwd: () => tempDir,
      chalk,
      logger: mockLogger,
    }
  }

  beforeEach(() => {
    // Create temp directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'status-test-'))
    loopworkDir = path.join(tempDir, '.loopwork')
    processesFile = path.join(loopworkDir, 'processes.json')
    monitorStateFile = path.join(loopworkDir, 'monitor-state.json')

    // Create .loopwork directory
    fs.mkdirSync(loopworkDir, { recursive: true })

    // Save original cwd
    originalCwd = process.cwd()
  })

  afterEach(() => {
    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  describe('processes.json reading', () => {
    test('shows CLI processes when processes.json exists with valid data', async () => {
      // Setup: Create processes.json with mock data
      const processesData = {
        processes: [
          {
            pid: 12345,
            command: '/usr/local/bin/claude',
            args: ['--task', 'TASK-001'],
            namespace: 'default',
            taskId: 'TASK-001',
            startTime: Date.now() - 300000, // 5 minutes ago
            status: 'running',
          },
          {
            pid: 12346,
            command: '/usr/local/bin/opencode',
            args: [],
            namespace: 'feature-auth',
            startTime: Date.now() - 120000, // 2 minutes ago
            status: 'running',
          },
        ],
      }
      fs.writeFileSync(processesFile, JSON.stringify(processesData))

      const mockIsProcessAlive = mock((pid: number) => true)
      const mockMonitor = {
        getStatus: mock(() => ({
          running: [],
          namespaces: [],
        })),
      }

      const { proc, output } = createProcess()
      await status(createDeps(proc, mockMonitor, mockIsProcessAlive, output))

      // Verify
      expect(output.text).toContain('Loopwork Status')
      expect(output.text).toContain('Active CLI Processes (2):')
      expect(output.text).toContain('claude')
      expect(output.text).toContain('opencode')
      expect(output.text).toContain('TASK-001')
      expect(output.text).toContain('default')
      expect(output.text).toContain('feature-auth')
      expect(output.text).toContain('12345')
      expect(output.text).toContain('12346')
      expect(mockIsProcessAlive).toHaveBeenCalledTimes(2)
    })

    test('handles missing processes.json gracefully', async () => {
      // Don't create processes.json
      expect(fs.existsSync(processesFile)).toBe(false)

      const mockMonitor = {
        getStatus: mock(() => ({
          running: [],
          namespaces: [],
        })),
      }

      const { proc, output } = createProcess()
      await status(createDeps(proc, mockMonitor, undefined, output))

      expect(output.text).toContain('Loopwork Status')
      expect(output.text).toContain('No loops currently running')
    })

    test('handles malformed/corrupt processes.json gracefully', async () => {
      // Create invalid JSON
      fs.writeFileSync(processesFile, 'invalid json content {[')

      const mockMonitor = {
        getStatus: mock(() => ({
          running: [],
          namespaces: [],
        })),
      }

      const { proc, output } = createProcess()
      await status(createDeps(proc, mockMonitor, undefined, output))

      // Should not crash, should show no processes
      expect(output.text).toContain('No loops currently running')
    })

    test('handles processes.json with empty processes array', async () => {
      fs.writeFileSync(processesFile, JSON.stringify({ processes: [] }))

      const mockMonitor = {
        getStatus: mock(() => ({
          running: [],
          namespaces: [],
        })),
      }

      const { proc, output } = createProcess()
      await status(createDeps(proc, mockMonitor, undefined, output))

      expect(output.text).toContain('No loops currently running')
    })

    test('handles processes.json with missing processes field', async () => {
      fs.writeFileSync(processesFile, JSON.stringify({ other: 'data' }))

      const mockMonitor = {
        getStatus: mock(() => ({
          running: [],
          namespaces: [],
        })),
      }

      const { proc, output } = createProcess()
      await status(createDeps(proc, mockMonitor, undefined, output))

      expect(output.text).toContain('No loops currently running')
    })
  })

  describe('process filtering', () => {
    test('filters out dead processes', async () => {
      // Setup: Create processes.json with 3 processes
      const processesData = {
        processes: [
          {
            pid: 12345,
            command: '/usr/local/bin/claude',
            args: [],
            namespace: 'default',
            startTime: Date.now() - 300000,
            status: 'running',
          },
          {
            pid: 99999, // Dead process
            command: '/usr/local/bin/opencode',
            args: [],
            namespace: 'feature-auth',
            startTime: Date.now() - 120000,
            status: 'running',
          },
          {
            pid: 12346,
            command: '/usr/local/bin/claude',
            args: [],
            namespace: 'feature-api',
            startTime: Date.now() - 60000,
            status: 'running',
          },
        ],
      }
      fs.writeFileSync(processesFile, JSON.stringify(processesData))

      // Mock isProcessAlive - only PIDs 12345 and 12346 are alive
      const mockIsProcessAlive = mock((pid: number) => pid !== 99999)

      const mockMonitor = {
        getStatus: mock(() => ({
          running: [],
          namespaces: [],
        })),
      }

      const { proc, output } = createProcess()
      await status(createDeps(proc, mockMonitor, mockIsProcessAlive, output))

      expect(output.text).toContain('Active CLI Processes (2):')
      expect(output.text).toContain('12345')
      expect(output.text).toContain('12346')
      expect(output.text).not.toContain('99999')
      expect(mockIsProcessAlive).toHaveBeenCalledTimes(3)
    })

    test('only shows processes where isProcessAlive returns true', async () => {
      const processesData = {
        processes: [
          {
            pid: 11111,
            command: '/usr/local/bin/claude',
            args: [],
            namespace: 'ns1',
            startTime: Date.now(),
            status: 'running',
          },
          {
            pid: 22222,
            command: '/usr/local/bin/claude',
            args: [],
            namespace: 'ns2',
            startTime: Date.now(),
            status: 'running',
          },
          {
            pid: 33333,
            command: '/usr/local/bin/claude',
            args: [],
            namespace: 'ns3',
            startTime: Date.now(),
            status: 'running',
          },
        ],
      }
      fs.writeFileSync(processesFile, JSON.stringify(processesData))

      // Only middle process is alive
      const mockIsProcessAlive = mock((pid: number) => pid === 22222)

      const mockMonitor = {
        getStatus: mock(() => ({
          running: [],
          namespaces: [],
        })),
      }

      const { proc, output } = createProcess()
      await status(createDeps(proc, mockMonitor, mockIsProcessAlive, output))

      expect(output.text).toContain('Active CLI Processes (1):')
      expect(output.text).toContain('22222')
      expect(output.text).not.toContain('11111')
      expect(output.text).not.toContain('33333')
    })

    test('returns empty array when all processes are dead', async () => {
      const processesData = {
        processes: [
          {
            pid: 11111,
            command: '/usr/local/bin/claude',
            args: [],
            namespace: 'ns1',
            startTime: Date.now(),
            status: 'running',
          },
          {
            pid: 22222,
            command: '/usr/local/bin/claude',
            args: [],
            namespace: 'ns2',
            startTime: Date.now(),
            status: 'running',
          },
        ],
      }
      fs.writeFileSync(processesFile, JSON.stringify(processesData))

      // All processes are dead
      const mockIsProcessAlive = mock((pid: number) => false)

      const mockMonitor = {
        getStatus: mock(() => ({
          running: [],
          namespaces: [],
        })),
      }

      const { proc, output } = createProcess()
      await status(createDeps(proc, mockMonitor, mockIsProcessAlive, output))

      expect(output.text).toContain('No loops currently running')
      expect(output.text).not.toContain('Active CLI Processes')
    })
  })

  describe('output formatting', () => {
    test('shows Active CLI Processes header when CLI processes exist', async () => {
      const processesData = {
        processes: [
          {
            pid: 12345,
            command: '/usr/local/bin/claude',
            args: [],
            namespace: 'default',
            startTime: Date.now() - 300000,
            status: 'running',
          },
        ],
      }
      fs.writeFileSync(processesFile, JSON.stringify(processesData))

      const mockMonitor = {
        getStatus: mock(() => ({
          running: [],
          namespaces: [],
        })),
      }

      const { proc, output } = createProcess()
      await status(createDeps(proc, mockMonitor, undefined, output))

      expect(output.text).toContain('Active CLI Processes (1):')
    })

    test('shows CLI name, task ID, PID, uptime, and namespace', async () => {
      const startTime = Date.now() - 300000 // 5 minutes ago
      const processesData = {
        processes: [
          {
            pid: 12345,
            command: '/usr/local/bin/claude',
            args: [],
            namespace: 'my-namespace',
            taskId: 'AUTH-001',
            startTime,
            status: 'running',
          },
        ],
      }
      fs.writeFileSync(processesFile, JSON.stringify(processesData))

      const mockMonitor = {
        getStatus: mock(() => ({
          running: [],
          namespaces: [],
        })),
      }

      const { proc, output } = createProcess()
      await status(createDeps(proc, mockMonitor, undefined, output))

      expect(output.text).toContain('claude')
      expect(output.text).toContain('AUTH-001')
      expect(output.text).toContain('12345')
      expect(output.text).toContain('my-namespace')
      expect(output.text).toMatch(/\d+m \d+s/)
    })

    test('shows Background Loops header for monitor processes', async () => {
      const mockMonitor = {
        getStatus: mock(() => ({
          running: [
            {
              namespace: 'test-ns',
              pid: 54321,
              startedAt: new Date().toISOString(),
              logFile: '/tmp/test.log',
              args: [],
            },
          ],
          namespaces: [],
        })),
      }

      const { proc, output } = createProcess()
      await status(createDeps(proc, mockMonitor, undefined, output))

      expect(output.text).toContain('Background Loops (1):')
    })

    test('shows "No loops currently running" when both sources empty', async () => {
      const mockMonitor = {
        getStatus: mock(() => ({
          running: [],
          namespaces: [],
        })),
      }

      const { proc, output } = createProcess()
      await status(createDeps(proc, mockMonitor, undefined, output))

      expect(output.text).toContain('Loopwork Status')
      expect(output.text).toContain('No loops currently running')
    })

    test('does not show "No loops" message when CLI processes exist', async () => {
      const processesData = {
        processes: [
          {
            pid: 12345,
            command: '/usr/local/bin/claude',
            args: [],
            namespace: 'default',
            startTime: Date.now(),
            status: 'running',
          },
        ],
      }
      fs.writeFileSync(processesFile, JSON.stringify(processesData))

      const mockMonitor = {
        getStatus: mock(() => ({
          running: [],
          namespaces: [],
        })),
      }

      const { proc, output } = createProcess()
      await status(createDeps(proc, mockMonitor, undefined, output))

      expect(output.text).not.toContain('No loops currently running')
    })
  })

  describe('namespace status', () => {
    test('namespace shows as running when CLI process exists for it', async () => {
      const processesData = {
        processes: [
          {
            pid: 12345,
            command: '/usr/local/bin/claude',
            args: [],
            namespace: 'feature-auth',
            startTime: Date.now(),
            status: 'running',
          },
        ],
      }
      fs.writeFileSync(processesFile, JSON.stringify(processesData))

      const mockMonitor = {
        getStatus: mock(() => ({
          running: [],
          namespaces: [
            { name: 'feature-auth', status: 'stopped' as const, lastRun: '2025-01-25T12:00:00' },
            { name: 'feature-api', status: 'stopped' as const, lastRun: '2025-01-25T11:00:00' },
          ],
        })),
      }

      const { proc, output } = createProcess()
      await status(createDeps(proc, mockMonitor, undefined, output))

      // feature-auth should show green dot (running)
      expect(output.text).toContain('feature-auth')
      // Should have green indicator (● or *) for running namespaces
      expect(output.text).toMatch(/[●\*].*feature-auth/)
    })

    test('namespace shows as stopped when no processes running', async () => {
      const mockMonitor = {
        getStatus: mock(() => ({
          running: [],
          namespaces: [{ name: 'feature-auth', status: 'stopped' as const, lastRun: '2025-01-25T12:00:00' }],
        })),
      }

      const { proc, output } = createProcess()
      await status(createDeps(proc, mockMonitor, undefined, output))

      // Should have gray indicator (○ or o) for stopped namespace
      expect(output.text).toMatch(/[○o].*feature-auth/)
    })

    test('multiple namespaces with mixed running/stopped status', async () => {
      const processesData = {
        processes: [
          {
            pid: 12345,
            command: '/usr/local/bin/claude',
            args: [],
            namespace: 'ns-running',
            startTime: Date.now(),
            status: 'running',
          },
        ],
      }
      fs.writeFileSync(processesFile, JSON.stringify(processesData))

      const mockMonitor = {
        getStatus: mock(() => ({
          running: [],
          namespaces: [
            { name: 'ns-running', status: 'stopped' as const },
            { name: 'ns-stopped', status: 'stopped' as const },
            { name: 'ns-monitor', status: 'running' as const },
          ],
        })),
      }

      const { proc, output } = createProcess()
      await status(createDeps(proc, mockMonitor, undefined, output))

      expect(output.text).toMatch(/[●\*].*ns-running/)
      expect(output.text).toMatch(/[○o].*ns-stopped/)
      expect(output.text).toMatch(/[●\*].*ns-monitor/)
    })
  })

  describe('combined output', () => {
    test('shows both CLI and monitor processes when both exist', async () => {
      // Setup CLI processes
      const processesData = {
        processes: [
          {
            pid: 12345,
            command: '/usr/local/bin/claude',
            args: [],
            namespace: 'default',
            taskId: 'TASK-001',
            startTime: Date.now() - 300000,
            status: 'running',
          },
        ],
      }
      fs.writeFileSync(processesFile, JSON.stringify(processesData))

      // Setup monitor processes
      const mockMonitor = {
        getStatus: mock(() => ({
          running: [
            {
              namespace: 'background-ns',
              pid: 54321,
              startedAt: new Date(Date.now() - 600000).toISOString(), // 10 minutes ago
              logFile: '/tmp/test.log',
              args: [],
            },
          ],
          namespaces: [],
        })),
      }

      const { proc, output } = createProcess()
      await status(createDeps(proc, mockMonitor, undefined, output))

      expect(output.text).toContain('Active CLI Processes (1):')
      expect(output.text).toContain('Background Loops (1):')
      expect(output.text).toContain('claude')
      expect(output.text).toContain('TASK-001')
      expect(output.text).toContain('default')
      expect(output.text).toContain('background-ns')
      expect(output.text).toContain('12345')
      expect(output.text).toContain('54321')
    })

    test('shows only CLI processes when monitor has none', async () => {
      const processesData = {
        processes: [
          {
            pid: 12345,
            command: '/usr/local/bin/opencode',
            args: [],
            namespace: 'default',
            startTime: Date.now(),
            status: 'running',
          },
        ],
      }
      fs.writeFileSync(processesFile, JSON.stringify(processesData))

      const mockMonitor = {
        getStatus: mock(() => ({
          running: [],
          namespaces: [],
        })),
      }

      const { proc, output } = createProcess()
      await status(createDeps(proc, mockMonitor, undefined, output))

      expect(output.text).toContain('Active CLI Processes (1):')
      expect(output.text).not.toContain('Background Loops')
    })

    test('shows only monitor processes when CLI has none', async () => {
      // Don't create processes.json
      const mockMonitor = {
        getStatus: mock(() => ({
          running: [
            {
              namespace: 'background-ns',
              pid: 54321,
              startedAt: new Date().toISOString(),
              logFile: '/tmp/test.log',
              args: [],
            },
          ],
          namespaces: [],
        })),
      }

      const { proc, output } = createProcess()
      await status(createDeps(proc, mockMonitor, undefined, output))

      expect(output.text).not.toContain('Active CLI Processes')
      expect(output.text).toContain('Background Loops (1):')
    })
  })

  describe('edge cases', () => {
    test('handles process without taskId', async () => {
      const processesData = {
        processes: [
          {
            pid: 12345,
            command: '/usr/local/bin/claude',
            args: [],
            namespace: 'default',
            startTime: Date.now(),
            status: 'running',
          },
        ],
      }
      fs.writeFileSync(processesFile, JSON.stringify(processesData))

      const mockMonitor = {
        getStatus: mock(() => ({
          running: [],
          namespaces: [],
        })),
      }

      const { proc, output } = createProcess()
      await status(createDeps(proc, mockMonitor, undefined, output))

      expect(output.text).not.toContain('[')
      expect(output.text).toContain('claude')
    })

    test('handles process with parentPid', async () => {
      const processesData = {
        processes: [
          {
            pid: 12345,
            command: '/usr/local/bin/claude',
            args: [],
            namespace: 'default',
            startTime: Date.now(),
            status: 'running',
            parentPid: 99999,
          },
        ],
      }
      fs.writeFileSync(processesFile, JSON.stringify(processesData))

      const mockMonitor = {
        getStatus: mock(() => ({
          running: [],
          namespaces: [],
        })),
      }

      const { proc, output } = createProcess()
      await status(createDeps(proc, mockMonitor, undefined, output))

      expect(output.text).toContain('Active CLI Processes (1):')
      expect(output.text).toContain('12345')
    })

    test('handles very recent process (uptime < 1 second)', async () => {
      const processesData = {
        processes: [
          {
            pid: 12345,
            command: '/usr/local/bin/claude',
            args: [],
            namespace: 'default',
            startTime: Date.now() - 500, // 500ms ago
            status: 'running',
          },
        ],
      }
      fs.writeFileSync(processesFile, JSON.stringify(processesData))

      const mockMonitor = {
        getStatus: mock(() => ({
          running: [],
          namespaces: [],
        })),
      }

      const { proc, output } = createProcess()
      await status(createDeps(proc, mockMonitor, undefined, output))

      expect(output.text).toMatch(/\d+s/)
    })

    test('handles very old process (uptime > 24 hours)', async () => {
      const oneDayAgo = Date.now() - 25 * 60 * 60 * 1000 // 25 hours
      const processesData = {
        processes: [
          {
            pid: 12345,
            command: '/usr/local/bin/claude',
            args: [],
            namespace: 'default',
            startTime: oneDayAgo,
            status: 'running',
          },
        ],
      }
      fs.writeFileSync(processesFile, JSON.stringify(processesData))

      const mockMonitor = {
        getStatus: mock(() => ({
          running: [],
          namespaces: [],
        })),
      }

      const { proc, output } = createProcess()
      await status(createDeps(proc, mockMonitor, undefined, output))

      expect(output.text).toMatch(/\d+h/)
    })
  })

  describe('JSON output mode', () => {
    test('outputs valid JSON when --json flag is set', async () => {
      const processesData = {
        processes: [
          {
            pid: 12345,
            command: '/usr/local/bin/claude',
            args: [],
            namespace: 'default',
            taskId: 'TASK-001',
            startTime: Date.now() - 300000,
            status: 'running',
          },
        ],
      }
      fs.writeFileSync(processesFile, JSON.stringify(processesData))

      const mockMonitor = {
        getStatus: mock(() => ({
          running: [],
          namespaces: [],
        })),
      }

      const { proc, output } = createProcess()
      const deps = createDeps(proc, mockMonitor, undefined, output)
      // Add json flag
      deps.json = true
      await status(deps)

      // Parse output as JSON
      const parsed = JSON.parse(output.text)

      expect(parsed.command).toBe('status')
      expect(parsed.timestamp).toBeDefined()
      expect(parsed.processes).toBeArray()
      expect(parsed.processes.length).toBe(1)
      expect(parsed.processes[0].pid).toBe(12345)
      expect(parsed.processes[0].namespace).toBe('default')
      expect(parsed.processes[0].taskId).toBe('TASK-001')
      expect(parsed.summary.total).toBe(1)
      expect(parsed.summary.active).toBe(1)
    })

    test('JSON output includes both CLI and monitor processes', async () => {
      const processesData = {
        processes: [
          {
            pid: 12345,
            command: '/usr/local/bin/claude',
            args: [],
            namespace: 'default',
            taskId: 'TASK-001',
            startTime: Date.now() - 300000,
            status: 'running',
          },
        ],
      }
      fs.writeFileSync(processesFile, JSON.stringify(processesData))

      const mockMonitor = {
        getStatus: mock(() => ({
          running: [
            {
              namespace: 'background-ns',
              pid: 54321,
              startedAt: new Date(Date.now() - 600000).toISOString(),
              logFile: '/tmp/test.log',
              args: [],
            },
          ],
          namespaces: [],
        })),
      }

      const { proc, output } = createProcess()
      const deps = createDeps(proc, mockMonitor, undefined, output)
      deps.json = true
      await status(deps)

      const parsed = JSON.parse(output.text)

      expect(parsed.processes.length).toBe(2)
      expect(parsed.summary.total).toBe(2)
      expect(parsed.summary.active).toBe(2)
    })

    test('JSON output returns empty array when no processes', async () => {
      const mockMonitor = {
        getStatus: mock(() => ({
          running: [],
          namespaces: [],
        })),
      }

      const { proc, output } = createProcess()
      const deps = createDeps(proc, mockMonitor, undefined, output)
      deps.json = true
      await status(deps)

      const parsed = JSON.parse(output.text)

      expect(parsed.processes).toBeArray()
      expect(parsed.processes.length).toBe(0)
      expect(parsed.summary.total).toBe(0)
      expect(parsed.summary.active).toBe(0)
    })
  })
})
