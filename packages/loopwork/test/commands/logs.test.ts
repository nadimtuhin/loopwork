import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import fs from 'fs'
import path from 'path'
import { logs } from '../../src/commands/logs'
import { LoopworkError } from '../../src/core/errors'
import * as logUtils from '../../src/commands/shared/log-utils'

describe('logs command', () => {
  let testRoot: string
  let logsDir: string
  let mainLog: string

  const createProcess = () => {
    const output = { text: '' }
    let sigintHandler: ((...args: any[]) => void) | undefined
    const proc = {
      ...process,
      stdout: {
        ...process.stdout,
        write: ((chunk: any) => {
          output.text += typeof chunk === 'string' ? chunk : chunk.toString()
          return true
        }) as any,
      },
      exit: mock(() => {
        throw new Error('process.exit')
      }) as any,
      on: ((event: string, handler: any) => {
        if (event === 'SIGINT') {
          sigintHandler = handler
        }
        return proc
      }) as any,
    }

    return { proc, output, getSigintHandler: () => sigintHandler }
  }

  const createDeps = (proc: NodeJS.Process, overrides: Partial<Parameters<typeof logs>[1]> = {}) => ({
    MonitorClass: class {
      constructor(_projectRoot: string) {}
      getRunningProcesses() {
        return []
      }
    } as any,
    findProjectRoot: () => testRoot,
    formatUptime: () => '5m',
    LoopworkErrorClass: LoopworkError,
    handleError: mock(() => {}),
    logUtils: {
      findLatestSession: logUtils.findLatestSession,
      listSessions: logUtils.listSessions,
      tailLogs: mock(() => ({ stop: mock(() => {}) })),
      formatLogLine: logUtils.formatLogLine,
      getMainLogFile: logUtils.getMainLogFile,
      readLastLines: logUtils.readLastLines,
      getTaskLogs: logUtils.getTaskLogs,
    },
    process: proc,
    ...overrides,
  })

  beforeEach(() => {
    testRoot = path.join(import.meta.dir, '../fixtures/logs-test')
    logsDir = path.join(testRoot, 'loopwork-runs/default/2025-01-25T10-00-00/logs')
    mainLog = path.join(testRoot, 'loopwork-runs/default/2025-01-25T10-00-00/loopwork.log')

    fs.mkdirSync(logsDir, { recursive: true })

    fs.writeFileSync(
      mainLog,
      `[2025-01-25 10:00:00] Starting task loop
[2025-01-25 10:00:01] [INFO] Loading task TASK-001
[2025-01-25 10:00:02] [SUCCESS] Task completed
[2025-01-25 10:00:03] [WARN] Rate limit approaching
[2025-01-25 10:00:04] [ERROR] Connection failed
`
    )

    fs.writeFileSync(
      path.join(logsDir, 'iteration-1-prompt.md'),
      '# Task: TASK-001\n\nImplement feature X'
    )
    fs.writeFileSync(
      path.join(logsDir, 'iteration-1-output.txt'),
      'Feature X implemented successfully'
    )
  })

  afterEach(() => {
    if (fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true })
    }
  })

  test('shows recent logs from latest session', async () => {
    const { proc, output } = createProcess()
    await logs({ namespace: 'default', lines: 50 }, createDeps(proc))

    expect(output.text).toContain('Starting task loop')
    expect(output.text).toContain('[INFO] Loading task TASK-001')
    expect(output.text).toContain('[SUCCESS] Task completed')
  })

  test('shows limited number of lines', async () => {
    const { proc, output } = createProcess()
    await logs({ namespace: 'default', lines: 2 }, createDeps(proc))

    const logLines = output.text.split('\n').filter(line => line.includes('[2025-01-25'))
    expect(logLines.length).toBeLessThanOrEqual(2)
  })

  test('shows task-specific logs when task filter specified', async () => {
    const { proc, output } = createProcess()
    await logs({ namespace: 'default', task: '1' }, createDeps(proc))

    expect(output.text).toContain('Iteration 1')
    expect(output.text).toContain('Implement feature X')
    expect(output.text).toContain('Feature X implemented successfully')
  })

  test('handles iteration-N task format', async () => {
    const { proc, output } = createProcess()
    await logs({ namespace: 'default', task: 'iteration-1' }, createDeps(proc))

    expect(output.text).toContain('Iteration 1')
  })

  test('exits with error when namespace not found', async () => {
    const { proc } = createProcess()
    try {
      await logs({ namespace: 'nonexistent' }, createDeps(proc))
    } catch (e: any) {
      if (e.message !== 'process.exit') throw e
    }

    expect((proc.exit as any).mock.calls[0][0]).toBe(1)
  })

  test('exits with error when task iteration not found', async () => {
    const { proc } = createProcess()
    try {
      await logs({ namespace: 'default', task: '999' }, createDeps(proc))
    } catch (e: any) {
      if (e.message !== 'process.exit') throw e
    }

    expect((proc.exit as any).mock.calls[0][0]).toBe(1)
  })

  test('shows specific session when session option provided', async () => {
    const session2Dir = path.join(testRoot, 'loopwork-runs/default/2025-01-25T11-00-00')
    const session2Log = path.join(session2Dir, 'loopwork.log')
    fs.mkdirSync(session2Dir, { recursive: true })
    fs.writeFileSync(session2Log, '[2025-01-25 11:00:00] Session 2 log\n')

    const { proc, output } = createProcess()
    await logs({ namespace: 'default', session: '2025-01-25T11-00-00' }, createDeps(proc))

    expect(output.text).toContain('Session 2 log')
  })

  test('supports partial session timestamp match', async () => {
    const { proc, output } = createProcess()
    await logs({ namespace: 'default', session: '2025-01-25T10' }, createDeps(proc))

    expect(output.text).toContain('Starting task loop')
  })

  test('formats log lines with colors', async () => {
    const { proc, output } = createProcess()
    await logs({ namespace: 'default', lines: 50 }, createDeps(proc))

    expect(output.text).toMatch(/\u001b\[|INFO|SUCCESS|ERROR/)
  })

  test('follow mode shows initial lines and sets up SIGINT handler', async () => {
    const { proc, output, getSigintHandler } = createProcess()
    const deps = createDeps(proc, {
      logUtils: {
        findLatestSession: logUtils.findLatestSession,
        listSessions: logUtils.listSessions,
        tailLogs: mock(() => ({ stop: mock(() => {}) })),
        formatLogLine: logUtils.formatLogLine,
        getMainLogFile: logUtils.getMainLogFile,
        readLastLines: logUtils.readLastLines,
        getTaskLogs: logUtils.getTaskLogs,
      },
    })

    logs({ namespace: 'default', follow: true }, deps).catch(e => {
      if (e.message !== 'process.exit') throw e
    })

    await new Promise(resolve => setTimeout(resolve, 50))

    const sigintHandler = getSigintHandler()
    expect(sigintHandler).toBeDefined()
    expect(output.text).toContain('Starting task loop')
    expect(output.text).toContain('Press Ctrl+C to stop')

    try {
      sigintHandler?.()
    } catch (e: any) {
      if (e.message !== 'process.exit') throw e
    }

    expect((proc.exit as any).mock.calls.length).toBeGreaterThan(0)
  }, 2000)

  test('follow mode handles missing log file gracefully', async () => {
    if (fs.existsSync(mainLog)) {
      fs.unlinkSync(mainLog)
    }

    const { proc } = createProcess()
    try {
      await logs({ namespace: 'default', follow: true }, createDeps(proc))
    } catch (e: any) {
      if (e.message !== 'process.exit') throw e
    }

    expect((proc.exit as any).mock.calls[0][0]).toBe(1)
  })
})
