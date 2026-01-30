import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { start, type StartOptions, type StartDeps } from '../src/commands/start'
import { kill, type KillOptions } from '../src/commands/kill'
import { restart, type RestartOptions, type RestartDeps } from '../src/commands/restart'
import { logs, type LogsOptions } from '../src/commands/logs'
import {
  monitorStart,
  monitorStop,
  monitorStatus,
  monitorLogs,
  type MonitorStartOptions,
  type MonitorLogsOptions,
} from '../src/commands/monitor'
import { LoopworkMonitor } from '../src/monitor'
import { saveRestartArgs, loadRestartArgs } from '../src/commands/shared/process-utils'

/**
 * E2E Tests for Loopwork CLI Commands
 *
 * This test suite validates the complete lifecycle of CLI commands:
 * - start: Launch processes in foreground and daemon mode
 * - kill/stop: Gracefully terminate processes
 * - restart: Stop and restart with saved arguments
 * - logs: View and tail log files
 * - monitor: Legacy monitor command interface
 *
 * Tests focus on command orchestration, state management, and error handling
 * without spawning actual long-running processes.
 */

describe('CLI Commands E2E', () => {
  let tempDir: string
  let stateDir: string
  let logsDir: string
  let originalCwd: string

  // Shared mock state
  let runningProcesses: Array<{
    namespace: string
    pid: number
    startedAt: string
    logFile: string
    args: string[]
  }> = []

  let processCounter = 10000

  beforeEach(() => {
    // Create isolated temp directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loopwork-e2e-cli-'))
    stateDir = path.join(tempDir, '.loopwork-state')
    logsDir = path.join(tempDir, 'loopwork-runs')
    originalCwd = process.cwd()

    // Create directory structure
    fs.mkdirSync(stateDir, { recursive: true })
    fs.mkdirSync(logsDir, { recursive: true })
    fs.mkdirSync(path.join(tempDir, 'loopwork-runs', 'default', 'monitor-logs'), { recursive: true })

    // Create package.json for project detection
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test-project' }))

    // Reset shared state
    runningProcesses = []
    processCounter = 10000

    // Change to test directory
    process.chdir(tempDir)
  })

  afterEach(() => {
    // Restore working directory
    process.chdir(originalCwd)

    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  function createMockMonitor() {
    return class MockMonitor {
      constructor(public projectRoot: string) {}

      async start(namespace: string, args: string[]) {
        // Check for conflicts
        const existing = runningProcesses.find(p => p.namespace === namespace)
        if (existing) {
          return {
            success: false,
            error: `Namespace '${namespace}' is already running (PID: ${existing.pid})`,
          }
        }

        // Create log file
        const sessionTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const sessionDir = path.join(this.projectRoot, 'loopwork-runs', namespace, sessionTimestamp)
        fs.mkdirSync(sessionDir, { recursive: true })
        fs.mkdirSync(path.join(sessionDir, 'logs'), { recursive: true })

        const logFile = path.join(sessionDir, 'loopwork.log')
        fs.writeFileSync(logFile, `[${new Date().toISOString()}] Started namespace: ${namespace}\n`)

        // Add to running processes
        const pid = processCounter++
        const proc = {
          namespace,
          pid,
          startedAt: new Date().toISOString(),
          logFile,
          args,
        }
        runningProcesses.push(proc)

        return { success: true, pid }
      }

      stop(namespace: string) {
        const index = runningProcesses.findIndex(p => p.namespace === namespace)
        if (index === -1) {
          return { success: false, error: `No running loop found for namespace '${namespace}'` }
        }

        runningProcesses.splice(index, 1)
        return { success: true }
      }

      stopAll() {
        const stopped = runningProcesses.map(p => p.namespace)
        runningProcesses = []
        return { stopped, errors: [] }
      }

      getRunningProcesses() {
        return [...runningProcesses]
      }

      getStatus() {
        return {
          running: [...runningProcesses],
          namespaces: runningProcesses.map(p => ({
            name: p.namespace,
            status: 'running' as const,
            lastRun: p.startedAt,
          })),
        }
      }
    }
  }

  function createMockLogger() {
    const calls: any[] = []
    return {
      info: mock((msg: string) => calls.push({ level: 'info', msg })),
      success: mock((msg: string) => calls.push({ level: 'success', msg })),
      warn: mock((msg: string) => calls.push({ level: 'warn', msg })),
      error: mock((msg: string) => calls.push({ level: 'error', msg })),
      debug: mock((msg: string) => calls.push({ level: 'debug', msg })),
      update: mock((msg: string) => calls.push({ level: 'update', msg })),
      _calls: calls,
    }
  }

  function createMockProcess() {
    let output = ''
    return {
      exit: mock((code: number) => {
        throw new Error(`process.exit(${code})`)
      }),
      kill: mock((pid: number, signal?: any) => {
        // Simulate process.kill(pid, 0) check
        const exists = runningProcesses.some(p => p.pid === pid)
        if (!exists) {
          const err: any = new Error('ESRCH: No such process')
          err.code = 'ESRCH'
          throw err
        }
        return true
      }),
      stdout: {
        write: mock((chunk: string) => {
          output += chunk
          return true
        }),
      },
      _output: () => output,
      _clearOutput: () => { output = '' },
    }
  }

  // ============================================================================
  // START COMMAND TESTS
  // ============================================================================

  describe('start command', () => {
    test('starts in foreground mode by default', async () => {
      let runCommandCalled = false
      const logger = createMockLogger()

      const deps: StartDeps = {
        MonitorClass: createMockMonitor() as any,
        findProjectRoot: () => tempDir,
        saveRestartArgs: () => {},
        logger: logger as any,
        runCommand: async (opts) => {
          runCommandCalled = true
        },
      }

      await start({ namespace: 'test' }, deps)

      expect(runCommandCalled).toBe(true)
      expect(runningProcesses.length).toBe(0) // Foreground doesn't add to monitor
    })

    test('starts in daemon mode with -d flag', async () => {
      const logger = createMockLogger()
      const proc = createMockProcess()

      const deps: StartDeps = {
        MonitorClass: createMockMonitor() as any,
        findProjectRoot: () => tempDir,
        saveRestartArgs: (root, ns, args) => {
          saveRestartArgs(root, ns, args)
        },
        logger: logger as any,
        process: proc as any,
      }

      await start({ namespace: 'daemon-test', daemon: true }, deps)

      expect(runningProcesses.length).toBe(1)
      expect(runningProcesses[0].namespace).toBe('daemon-test')
      expect((logger.success as any).mock.calls.length).toBeGreaterThan(0)

      // Verify restart args were saved
      const savedArgs = loadRestartArgs(tempDir, 'daemon-test')
      expect(savedArgs).not.toBeNull()
      expect(savedArgs!.namespace).toBe('daemon-test')
    })

    test('prevents starting duplicate namespace', async () => {
      const logger = createMockLogger()
      const proc = createMockProcess()

      const deps: StartDeps = {
        MonitorClass: createMockMonitor() as any,
        findProjectRoot: () => tempDir,
        saveRestartArgs: () => {},
        logger: logger as any,
        process: proc as any,
      }

      // Start first instance
      await start({ namespace: 'dup-test', daemon: true }, deps)
      expect(runningProcesses.length).toBe(1)

      // Try to start duplicate - should throw LoopworkError
      await expect(async () => {
        await start({ namespace: 'dup-test', daemon: true }, deps)
      }).toThrow('already running')

      expect(runningProcesses.length).toBe(1) // Still only one
    })

    test('passes through options to run command', async () => {
      let capturedOptions: any = null
      const logger = createMockLogger()

      const deps: StartDeps = {
        MonitorClass: createMockMonitor() as any,
        findProjectRoot: () => tempDir,
        saveRestartArgs: () => {},
        logger: logger as any,
        runCommand: async (opts) => {
          capturedOptions = opts
        },
      }

      await start(
        {
          namespace: 'options-test',
          feature: 'auth',
          maxIterations: 10,
          cli: 'claude',
          debug: true,
        },
        deps
      )

      expect(capturedOptions).not.toBeNull()
      expect(capturedOptions.namespace).toBe('options-test')
      expect(capturedOptions.feature).toBe('auth')
      expect(capturedOptions.maxIterations).toBe(10)
      expect(capturedOptions.cli).toBe('claude')
      expect(capturedOptions.debug).toBe(true)
    })
  })

  // ============================================================================
  // KILL/STOP COMMAND TESTS
  // ============================================================================

  describe('kill command', () => {
    test('stops a running namespace', async () => {
      // Start a process first
      const monitor = new (createMockMonitor() as any)(tempDir)
      await monitor.start('kill-test', [])

      expect(runningProcesses.length).toBe(1)

      const logger = createMockLogger()
      await kill(
        { namespace: 'kill-test' },
        {
          MonitorClass: createMockMonitor() as any,
          logger: logger as any,
          findProjectRoot: () => tempDir,
        }
      )

      expect(runningProcesses.length).toBe(0)
      expect((logger.success as any).mock.calls.length).toBeGreaterThan(0)
    })

    test('stops all namespaces with --all flag', async () => {
      // Start multiple processes
      const monitor = new (createMockMonitor() as any)(tempDir)
      await monitor.start('test1', [])
      await monitor.start('test2', [])
      await monitor.start('test3', [])

      expect(runningProcesses.length).toBe(3)

      const logger = createMockLogger()
      await kill(
        { all: true },
        {
          MonitorClass: createMockMonitor() as any,
          logger: logger as any,
          findProjectRoot: () => tempDir,
        }
      )

      expect(runningProcesses.length).toBe(0)
      expect((logger.success as any).mock.calls.length).toBeGreaterThan(0)
    })

    test('errors when stopping non-existent namespace', async () => {
      const logger = createMockLogger()
      const proc = createMockProcess()
      const handleError = mock(() => {})

      await expect(async () => {
        await kill(
          { namespace: 'non-existent' },
          {
            MonitorClass: createMockMonitor() as any,
            logger: logger as any,
            findProjectRoot: () => tempDir,
            LoopworkErrorClass: class extends Error {
              constructor(msg: string, public suggestions: string[]) {
                super(msg)
              }
            } as any,
          }
        )
      }).toThrow()
    })
  })

  // ============================================================================
  // RESTART COMMAND TESTS
  // ============================================================================

  describe('restart command', () => {
    test('restarts a previously started daemon', async () => {
      // Start daemon
      const monitor = new (createMockMonitor() as any)(tempDir)
      const args = ['--feature', 'auth', '--cli', 'claude']
      await monitor.start('restart-test', args)
      saveRestartArgs(tempDir, 'restart-test', args)

      expect(runningProcesses.length).toBe(1)
      const originalPid = runningProcesses[0].pid

      // Restart it
      const logger = createMockLogger()
      const proc = createMockProcess()

      const deps: RestartDeps = {
        MonitorClass: createMockMonitor() as any,
        logger: logger as any,
        findProjectRoot: () => tempDir,
        loadRestartArgs: (root, ns) => loadRestartArgs(root, ns),
        process: proc as any,
        waitForProcessExit: async () => true, // Simulate successful exit
      }

      await restart({ namespace: 'restart-test' }, deps)

      expect(runningProcesses.length).toBe(1)
      expect(runningProcesses[0].pid).not.toBe(originalPid) // New PID
      expect(runningProcesses[0].namespace).toBe('restart-test')
      expect((logger.success as any).mock.calls.length).toBeGreaterThan(0)
    })

    test('errors when no saved restart args exist', async () => {
      const logger = createMockLogger()
      const proc = createMockProcess()
      const handleError = mock(() => {})

      const deps: RestartDeps = {
        MonitorClass: createMockMonitor() as any,
        logger: logger as any,
        handleError: handleError as any,
        findProjectRoot: () => tempDir,
        loadRestartArgs: () => null,
        process: proc as any,
      }

      await expect(async () => {
        await restart({ namespace: 'no-args' }, deps)
      }).toThrow()

      expect(handleError).toHaveBeenCalled()
    })

    test('waits for process to exit before restarting', async () => {
      // Start daemon
      const monitor = new (createMockMonitor() as any)(tempDir)
      await monitor.start('wait-test', [])
      saveRestartArgs(tempDir, 'wait-test', [])

      let waitCalled = false
      const logger = createMockLogger()
      const proc = createMockProcess()

      const deps: RestartDeps = {
        MonitorClass: createMockMonitor() as any,
        logger: logger as any,
        findProjectRoot: () => tempDir,
        loadRestartArgs: (root, ns) => loadRestartArgs(root, ns),
        process: proc as any,
        waitForProcessExit: async (pid: number, timeout?: number) => {
          waitCalled = true
          expect(timeout).toBe(10000)
          return true
        },
      }

      await restart({ namespace: 'wait-test' }, deps)

      expect(waitCalled).toBe(true)
    })

    test('errors when process does not exit in time', async () => {
      // Start daemon
      const monitor = new (createMockMonitor() as any)(tempDir)
      await monitor.start('stuck-test', [])
      saveRestartArgs(tempDir, 'stuck-test', [])

      const logger = createMockLogger()
      const proc = createMockProcess()
      const handleError = mock(() => {})

      const deps: RestartDeps = {
        MonitorClass: createMockMonitor() as any,
        logger: logger as any,
        handleError: handleError as any,
        findProjectRoot: () => tempDir,
        loadRestartArgs: (root, ns) => loadRestartArgs(root, ns),
        process: proc as any,
        waitForProcessExit: async () => false, // Simulate timeout
      }

      await expect(async () => {
        await restart({ namespace: 'stuck-test' }, deps)
      }).toThrow()

      expect(handleError).toHaveBeenCalled()
    })
  })

  // ============================================================================
  // LOGS COMMAND TESTS
  // ============================================================================

  describe('logs command', () => {
    test('shows logs for running namespace', async () => {
      // Start a process with logs
      const monitor = new (createMockMonitor() as any)(tempDir)
      await monitor.start('log-test', [])

      const logFile = runningProcesses[0].logFile
      fs.appendFileSync(logFile, '[2025-01-30T12:00:00] INFO: Task started\n')
      fs.appendFileSync(logFile, '[2025-01-30T12:01:00] SUCCESS: Task completed\n')

      const proc = createMockProcess()
      const logger = createMockLogger()

      await logs(
        { namespace: 'log-test', lines: 10 },
        {
          MonitorClass: createMockMonitor() as any,
          logger: logger as any,
          findProjectRoot: () => tempDir,
          process: proc as any,
        }
      )

      const output = (proc as any)._output()
      expect(output).toContain('Task started')
      expect(output).toContain('Task completed')
    })

    test('shows logs for stopped namespace', async () => {
      // Create session logs manually
      const sessionTimestamp = '2025-01-30T12-00-00'
      const sessionDir = path.join(tempDir, 'loopwork-runs', 'stopped-test', sessionTimestamp)
      fs.mkdirSync(sessionDir, { recursive: true })

      const logFile = path.join(sessionDir, 'loopwork.log')
      fs.writeFileSync(logFile, '[2025-01-30T12:00:00] INFO: Previous run\n')

      const proc = createMockProcess()
      const logger = createMockLogger()

      await logs(
        { namespace: 'stopped-test', lines: 10 },
        {
          MonitorClass: createMockMonitor() as any,
          logger: logger as any,
          findProjectRoot: () => tempDir,
          process: proc as any,
        }
      )

      const output = (proc as any)._output()
      expect(output).toContain('stopped')
      expect(output).toContain('Previous run')
    })

    test('errors when no logs exist', async () => {
      const proc = createMockProcess()
      const logger = createMockLogger()
      const handleError = mock(() => {})

      await expect(async () => {
        await logs(
          { namespace: 'no-logs', lines: 10 },
          {
            MonitorClass: createMockMonitor() as any,
            logger: logger as any,
            findProjectRoot: () => tempDir,
            handleError: handleError as any,
            process: proc as any,
          }
        )
      }).toThrow()

      expect(handleError).toHaveBeenCalled()
    })

    test('shows task-specific logs with --task flag', async () => {
      // Create session with task logs
      const sessionTimestamp = '2025-01-30T12-00-00'
      const sessionDir = path.join(tempDir, 'loopwork-runs', 'task-logs', sessionTimestamp)
      const logsDir = path.join(sessionDir, 'logs')
      fs.mkdirSync(logsDir, { recursive: true })

      const mainLog = path.join(sessionDir, 'loopwork.log')
      fs.writeFileSync(mainLog, '[2025-01-30T12:00:00] INFO: Main log\n')

      const promptFile = path.join(logsDir, 'iteration-1-prompt.md')
      const outputFile = path.join(logsDir, 'iteration-1-output.txt')
      fs.writeFileSync(promptFile, '# Task: Fix the bug\n\nFix the authentication bug')
      fs.writeFileSync(outputFile, 'Bug fixed successfully')

      const proc = createMockProcess()
      const logger = createMockLogger()

      await logs(
        { namespace: 'task-logs', task: '1' },
        {
          MonitorClass: createMockMonitor() as any,
          logger: logger as any,
          findProjectRoot: () => tempDir,
          process: proc as any,
        }
      )

      const output = (proc as any)._output()
      expect(output).toContain('Iteration 1')
      expect(output).toContain('Fix the authentication bug')
      expect(output).toContain('Bug fixed successfully')
    })
  })

  // ============================================================================
  // MONITOR COMMAND TESTS (Legacy)
  // ============================================================================

  describe('monitor commands', () => {
    test('monitor start launches daemon', async () => {
      const logger = createMockLogger()
      const proc = createMockProcess()

      await monitorStart(
        { namespace: 'monitor-start-test', args: ['--cli', 'claude'] },
        {
          MonitorClass: createMockMonitor() as any,
          findProjectRoot: () => tempDir,
          logger: logger as any,
          process: proc as any,
        }
      )

      expect(runningProcesses.length).toBe(1)
      expect(runningProcesses[0].namespace).toBe('monitor-start-test')
    })

    test('monitor stop terminates daemon', async () => {
      // Start first
      const monitor = new (createMockMonitor() as any)(tempDir)
      await monitor.start('monitor-stop-test', [])

      const logger = createMockLogger()
      const proc = createMockProcess()

      await monitorStop('monitor-stop-test', {
        MonitorClass: createMockMonitor() as any,
        findProjectRoot: () => tempDir,
        logger: logger as any,
        process: proc as any,
      })

      expect(runningProcesses.length).toBe(0)
    })

    test('monitor status shows all namespaces', async () => {
      // Start multiple
      const monitor = new (createMockMonitor() as any)(tempDir)
      await monitor.start('status-test-1', [])
      await monitor.start('status-test-2', [])

      const proc = createMockProcess()

      await monitorStatus({
        MonitorClass: createMockMonitor() as any,
        findProjectRoot: () => tempDir,
        process: proc as any,
      })

      const output = (proc as any)._output()
      expect(output).toContain('status-test-1')
      expect(output).toContain('status-test-2')
      expect(output).toContain('Running (2)')
    })

    test('monitor logs displays namespace logs', async () => {
      // Start with logs
      const monitor = new (createMockMonitor() as any)(tempDir)
      await monitor.start('monitor-logs-test', [])

      const logFile = runningProcesses[0].logFile
      fs.appendFileSync(logFile, '[2025-01-30T12:00:00] Monitor log entry\n')

      const proc = createMockProcess()

      await monitorLogs(
        { namespace: 'monitor-logs-test', lines: 10 },
        {
          MonitorClass: createMockMonitor() as any,
          findProjectRoot: () => tempDir,
          process: proc as any,
        }
      )

      const output = (proc as any)._output()
      expect(output).toContain('Monitor log entry')
    })
  })

  // ============================================================================
  // INTEGRATION TESTS - Complete Workflows
  // ============================================================================

  describe('complete CLI workflows', () => {
    test('full lifecycle: start → logs → restart → kill', async () => {
      const logger = createMockLogger()
      const proc = createMockProcess()

      // 1. Start daemon
      await start(
        { namespace: 'lifecycle', daemon: true, cli: 'claude' },
        {
          MonitorClass: createMockMonitor() as any,
          findProjectRoot: () => tempDir,
          saveRestartArgs: (root, ns, args) => saveRestartArgs(root, ns, args),
          logger: logger as any,
          process: proc as any,
        }
      )

      expect(runningProcesses.length).toBe(1)
      const originalPid = runningProcesses[0].pid

      // 2. View logs
      fs.appendFileSync(runningProcesses[0].logFile, '[2025-01-30] Log message\n')
      ;(proc as any)._clearOutput()

      await logs(
        { namespace: 'lifecycle', lines: 10 },
        {
          MonitorClass: createMockMonitor() as any,
          logger: logger as any,
          findProjectRoot: () => tempDir,
          process: proc as any,
        }
      )

      expect((proc as any)._output()).toContain('Log message')

      // 3. Restart
      await restart(
        { namespace: 'lifecycle' },
        {
          MonitorClass: createMockMonitor() as any,
          logger: logger as any,
          findProjectRoot: () => tempDir,
          loadRestartArgs: (root, ns) => loadRestartArgs(root, ns),
          process: proc as any,
          waitForProcessExit: async () => true,
        }
      )

      expect(runningProcesses.length).toBe(1)
      expect(runningProcesses[0].pid).not.toBe(originalPid)

      // 4. Kill
      await kill(
        { namespace: 'lifecycle' },
        {
          MonitorClass: createMockMonitor() as any,
          logger: logger as any,
          findProjectRoot: () => tempDir,
        }
      )

      expect(runningProcesses.length).toBe(0)
    })

    test('multiple namespaces can run concurrently', async () => {
      const logger = createMockLogger()
      const proc = createMockProcess()

      const deps: StartDeps = {
        MonitorClass: createMockMonitor() as any,
        findProjectRoot: () => tempDir,
        saveRestartArgs: () => {},
        logger: logger as any,
        process: proc as any,
      }

      // Start multiple namespaces
      await start({ namespace: 'frontend', daemon: true }, deps)
      await start({ namespace: 'backend', daemon: true }, deps)
      await start({ namespace: 'worker', daemon: true }, deps)

      expect(runningProcesses.length).toBe(3)
      expect(runningProcesses.map(p => p.namespace)).toEqual(['frontend', 'backend', 'worker'])

      // Kill all
      await kill(
        { all: true },
        {
          MonitorClass: createMockMonitor() as any,
          logger: logger as any,
          findProjectRoot: () => tempDir,
        }
      )

      expect(runningProcesses.length).toBe(0)
    })

    test('error recovery: failed start does not leave zombie state', async () => {
      const logger = createMockLogger()
      const proc = createMockProcess()
      const handleError = mock(() => {})

      const deps: StartDeps = {
        MonitorClass: createMockMonitor() as any,
        findProjectRoot: () => tempDir,
        saveRestartArgs: () => {},
        logger: logger as any,
        handleError: handleError as any,
        process: proc as any,
      }

      // Start successfully
      await start({ namespace: 'error-test', daemon: true }, deps)
      expect(runningProcesses.length).toBe(1)

      // Try to start duplicate (should fail)
      await expect(async () => {
        await start({ namespace: 'error-test', daemon: true }, deps)
      }).toThrow()

      // State should still be clean
      expect(runningProcesses.length).toBe(1)

      // Cleanup should work
      await kill(
        { namespace: 'error-test' },
        {
          MonitorClass: createMockMonitor() as any,
          logger: logger as any,
          findProjectRoot: () => tempDir,
        }
      )

      expect(runningProcesses.length).toBe(0)
    })

    test('handles missing config gracefully', async () => {
      const logger = createMockLogger()
      const proc = createMockProcess()

      // Start with non-existent config
      let runCalled = false
      await start(
        { config: '/non/existent/config.ts' },
        {
          MonitorClass: createMockMonitor() as any,
          findProjectRoot: () => tempDir,
          saveRestartArgs: () => {},
          logger: logger as any,
          process: proc as any,
          runCommand: async (opts) => {
            runCalled = true
            expect(opts.config).toBe('/non/existent/config.ts')
          },
        }
      )

      expect(runCalled).toBe(true)
    })
  })

  // ============================================================================
  // ERROR HANDLING TESTS
  // ============================================================================

  describe('error handling', () => {
    test('validates namespace argument', async () => {
      const logger = createMockLogger()
      const proc = createMockProcess()

      await start(
        { namespace: '', daemon: true },
        {
          MonitorClass: createMockMonitor() as any,
          findProjectRoot: () => tempDir,
          saveRestartArgs: () => {},
          logger: logger as any,
          process: proc as any,
        }
      )

      // Should use 'default' when empty
      expect(runningProcesses.some(p => p.namespace === 'default')).toBe(true)
    })

    test('handles invalid log file paths', async () => {
      const proc = createMockProcess()
      const logger = createMockLogger()
      const handleError = mock(() => {})

      // Try to read logs from non-existent namespace
      await expect(async () => {
        await logs(
          { namespace: 'invalid-namespace' },
          {
            MonitorClass: createMockMonitor() as any,
            logger: logger as any,
            findProjectRoot: () => tempDir,
            handleError: handleError as any,
            process: proc as any,
          }
        )
      }).toThrow()
    })

    test('restart handles missing process gracefully', async () => {
      const logger = createMockLogger()
      const proc = createMockProcess()

      // Save restart args without actually running process
      saveRestartArgs(tempDir, 'ghost-process', ['--cli', 'claude'])

      // Restart should handle missing process
      await restart(
        { namespace: 'ghost-process' },
        {
          MonitorClass: createMockMonitor() as any,
          logger: logger as any,
          findProjectRoot: () => tempDir,
          loadRestartArgs: (root, ns) => loadRestartArgs(root, ns),
          process: proc as any,
          waitForProcessExit: async () => true,
        }
      )

      // Should start successfully even though nothing was running
      expect(runningProcesses.length).toBe(1)
      expect(runningProcesses[0].namespace).toBe('ghost-process')
    })
  })
})
