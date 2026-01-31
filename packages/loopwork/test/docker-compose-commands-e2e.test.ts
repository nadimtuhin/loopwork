import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { up, type UpOptions, type UpDeps } from '../src/commands/up'
import { down, type DownOptions, type DownDeps } from '../src/commands/down'
import { saveRestartArgs, loadRestartArgs } from '../src/commands/shared/process-utils'

/**
 * E2E Tests for Docker Compose-style Commands
 *
 * Tests the new Docker Compose-style CLI commands:
 * - up: Start in foreground or detached mode
 * - down: Stop processes
 * - ps: List running processes (uses existing status command)
 *
 * These commands provide a unified interface similar to Docker Compose,
 * with backward compatibility for existing start/stop commands.
 */

describe('Docker Compose Commands E2E', () => {
  let tempDir: string
  let stateDir: string
  let logsDir: string

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
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loopwork-e2e-dc-'))
    stateDir = path.join(tempDir, '.loopwork-state')
    logsDir = path.join(tempDir, '.loopwork/runs')

    // Create directory structure
    fs.mkdirSync(stateDir, { recursive: true })
    fs.mkdirSync(logsDir, { recursive: true })
    fs.mkdirSync(path.join(tempDir, '.loopwork/runs', 'default', 'monitor-logs'), { recursive: true })

    // Create package.json for project detection
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test-project' }))

    // Create minimal loopwork.config.ts for config loading
    fs.writeFileSync(
      path.join(tempDir, 'loopwork.config.ts'),
      `export default { cli: 'claude', maxIterations: 10 }`
    )

    // Reset shared state
    runningProcesses = []
    processCounter = 10000
  })

  afterEach(() => {
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

        // Create log file with session structure
        const sessionTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const sessionDir = path.join(this.projectRoot, '.loopwork/runs', namespace, sessionTimestamp)
        fs.mkdirSync(sessionDir, { recursive: true })
        fs.mkdirSync(path.join(sessionDir, 'logs'), { recursive: true })

        const logFile = path.join(sessionDir, 'loopwork.log')
        fs.writeFileSync(logFile, `[${new Date().toISOString()}] Started namespace: ${namespace}\n`)

        // Create session.json
        const sessionFile = path.join(sessionDir, 'session.json')
        fs.writeFileSync(sessionFile, JSON.stringify({
          id: sessionTimestamp,
          namespace,
          mode: 'daemon',
          pid: processCounter,
          startedAt: new Date().toISOString(),
          status: 'running',
          args,
        }, null, 2))

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

  function createMockLogger(proc?: any) {
    const calls: any[] = []
    return {
      info: mock((msg: string) => calls.push({ level: 'info', msg })),
      success: mock((msg: string) => calls.push({ level: 'success', msg })),
      warn: mock((msg: string) => calls.push({ level: 'warn', msg })),
      error: mock((msg: string) => calls.push({ level: 'error', msg })),
      debug: mock((msg: string) => calls.push({ level: 'debug', msg })),
      update: mock((msg: string) => calls.push({ level: 'update', msg })),
      raw: mock((msg: string) => {
        calls.push({ level: 'raw', msg })
        if (proc?.stdout?.write) {
          proc.stdout.write(msg + '\n')
        }
      }),
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
  // UP COMMAND TESTS
  // ============================================================================

  describe('up command', () => {
    test('starts in foreground mode by default', async () => {
      let runCommandCalled = false
      const logger = createMockLogger()

      const deps: UpDeps = {
        MonitorClass: createMockMonitor() as any,
        findProjectRoot: () => tempDir,
        saveRestartArgs: () => {},
        logger: logger as any,
        runCommand: async (opts) => {
          runCommandCalled = true
          expect(opts.namespace).toBe('test')
        },
      }

      await up({ namespace: 'test' }, deps)

      expect(runCommandCalled).toBe(true)
      expect(runningProcesses.length).toBe(0) // Foreground doesn't add to monitor
    })

    test('starts in detached mode with -d flag', async () => {
      const logger = createMockLogger()
      const proc = createMockProcess()

      const deps: UpDeps = {
        MonitorClass: createMockMonitor() as any,
        findProjectRoot: () => tempDir,
        saveRestartArgs: (root, ns, args) => {
          saveRestartArgs(root, ns, args)
        },
        logger: logger as any,
        process: proc as any,
      }

      await up({ namespace: 'detached-test', detached: true }, deps)

      expect(runningProcesses.length).toBe(1)
      expect(runningProcesses[0].namespace).toBe('detached-test')
      expect((logger.success as any).mock.calls.length).toBeGreaterThan(0)

      // Verify restart args were saved
      const savedArgs = loadRestartArgs(tempDir, 'detached-test')
      expect(savedArgs).not.toBeNull()
      expect(savedArgs!.namespace).toBe('detached-test')
    })

    test('prevents starting duplicate namespace in detached mode', async () => {
      const logger = createMockLogger()
      const proc = createMockProcess()

      const deps: UpDeps = {
        MonitorClass: createMockMonitor() as any,
        findProjectRoot: () => tempDir,
        saveRestartArgs: () => {},
        logger: logger as any,
        process: proc as any,
      }

      // Start first instance
      await up({ namespace: 'dup-test', detached: true }, deps)
      expect(runningProcesses.length).toBe(1)

      // Try to start duplicate - should throw
      await expect(async () => {
        await up({ namespace: 'dup-test', detached: true }, deps)
      }).toThrow('already running')

      expect(runningProcesses.length).toBe(1) // Still only one
    })

    test('passes through all options to run command', async () => {
      let capturedOptions: any = null
      const logger = createMockLogger()

      const deps: UpDeps = {
        MonitorClass: createMockMonitor() as any,
        findProjectRoot: () => tempDir,
        saveRestartArgs: () => {},
        logger: logger as any,
        runCommand: async (opts) => {
          capturedOptions = opts
        },
      }

      await up(
        {
          namespace: 'options-test',
          feature: 'auth',
          maxIterations: 10,
          cli: 'claude',
          debug: true,
          backend: 'json',
          tasksFile: './tasks.json',
        },
        deps
      )

      expect(capturedOptions).not.toBeNull()
      expect(capturedOptions.namespace).toBe('options-test')
      expect(capturedOptions.feature).toBe('auth')
      expect(capturedOptions.maxIterations).toBe(10)
      expect(capturedOptions.cli).toBe('claude')
      expect(capturedOptions.debug).toBe(true)
      expect(capturedOptions.backend).toBe('json')
      expect(capturedOptions.tasksFile).toBe('./tasks.json')
    })

    test('supports --resume flag in foreground mode', async () => {
      let capturedOptions: any = null
      const logger = createMockLogger()

      const deps: UpDeps = {
        MonitorClass: createMockMonitor() as any,
        findProjectRoot: () => tempDir,
        saveRestartArgs: () => {},
        logger: logger as any,
        runCommand: async (opts) => {
          capturedOptions = opts
        },
      }

      await up({ namespace: 'resume-test', resume: true }, deps)

      expect(capturedOptions).not.toBeNull()
      expect(capturedOptions.resume).toBe(true)
    })

    test('creates session metadata in detached mode', async () => {
      const logger = createMockLogger()
      const proc = createMockProcess()

      const deps: UpDeps = {
        MonitorClass: createMockMonitor() as any,
        findProjectRoot: () => tempDir,
        saveRestartArgs: () => {},
        logger: logger as any,
        process: proc as any,
      }

      await up({ namespace: 'session-test', detached: true }, deps)

      // Check session.json was created
      const runsDir = path.join(tempDir, '.loopwork/runs', 'session-test')
      expect(fs.existsSync(runsDir)).toBe(true)

      const sessions = fs.readdirSync(runsDir).filter(d => d !== 'monitor-logs')
      expect(sessions.length).toBeGreaterThan(0)

      const sessionFile = path.join(runsDir, sessions[0], 'session.json')
      expect(fs.existsSync(sessionFile)).toBe(true)

      const sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'))
      expect(sessionData.namespace).toBe('session-test')
      expect(sessionData.mode).toBe('daemon')
      expect(sessionData.status).toBe('running')
    })
  })

  // ============================================================================
  // DOWN COMMAND TESTS
  // ============================================================================

  describe('down command', () => {
    test('stops a specific namespace', async () => {
      // Start a process first
      const monitor = new (createMockMonitor() as any)(tempDir)
      await monitor.start('down-test', [])

      expect(runningProcesses.length).toBe(1)

      const logger = createMockLogger()
      const deps: DownDeps = {
        MonitorClass: createMockMonitor() as any,
        logger: logger as any,
        findProjectRoot: () => tempDir,
      }

      await down({ namespace: 'down-test' }, deps)

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
      const deps: DownDeps = {
        MonitorClass: createMockMonitor() as any,
        logger: logger as any,
        findProjectRoot: () => tempDir,
      }

      await down({ all: true }, deps)

      expect(runningProcesses.length).toBe(0)
      expect((logger.success as any).mock.calls.length).toBeGreaterThan(0)
    })

    test('uses default namespace when none specified', async () => {
      // Start default namespace
      const monitor = new (createMockMonitor() as any)(tempDir)
      await monitor.start('default', [])

      expect(runningProcesses.length).toBe(1)

      const logger = createMockLogger()
      const deps: DownDeps = {
        MonitorClass: createMockMonitor() as any,
        logger: logger as any,
        findProjectRoot: () => tempDir,
      }

      await down({}, deps)

      expect(runningProcesses.length).toBe(0)
    })

    test('handles non-existent namespace gracefully', async () => {
      const logger = createMockLogger()
      const deps: DownDeps = {
        MonitorClass: createMockMonitor() as any,
        logger: logger as any,
        findProjectRoot: () => tempDir,
      }

      // Should not throw, just inform user
      await down({ namespace: 'non-existent' }, deps)

      expect((logger.info as any).mock.calls.some((call: any) =>
        call[0].includes('No running process')
      )).toBe(true)
    })

    test('handles no running processes gracefully with --all', async () => {
      const logger = createMockLogger()
      const deps: DownDeps = {
        MonitorClass: createMockMonitor() as any,
        logger: logger as any,
        findProjectRoot: () => tempDir,
      }

      await down({ all: true }, deps)

      expect(runningProcesses.length).toBe(0)
      expect((logger.info as any).mock.calls.some((call: any) =>
        call[0].includes('No running') || call[0].includes('No daemons')
      )).toBe(true)
    })
  })

  // ============================================================================
  // INTEGRATION TESTS - Complete Docker Compose Workflows
  // ============================================================================

  describe('Docker Compose workflow integration', () => {
    test('up → ps → down lifecycle', async () => {
      const proc = createMockProcess()
      const logger = createMockLogger(proc)

      // 1. Start with up -d
      await up(
        { namespace: 'compose-test', detached: true, cli: 'claude' },
        {
          MonitorClass: createMockMonitor() as any,
          findProjectRoot: () => tempDir,
          saveRestartArgs: (root, ns, args) => saveRestartArgs(root, ns, args),
          logger: logger as any,
          process: proc as any,
        }
      )

      expect(runningProcesses.length).toBe(1)
      expect(runningProcesses[0].namespace).toBe('compose-test')

      // 2. Check status with ps (using getStatus from monitor)
      const monitor = new (createMockMonitor() as any)(tempDir)
      const status = monitor.getStatus()
      expect(status.running.length).toBe(1)
      expect(status.running[0].namespace).toBe('compose-test')

      // 3. Stop with down
      await down(
        { namespace: 'compose-test' },
        {
          MonitorClass: createMockMonitor() as any,
          logger: logger as any,
          findProjectRoot: () => tempDir,
        }
      )

      expect(runningProcesses.length).toBe(0)
    })

    test('multiple services with up -d and down --all', async () => {
      const logger = createMockLogger()
      const proc = createMockProcess()

      const upDeps: UpDeps = {
        MonitorClass: createMockMonitor() as any,
        findProjectRoot: () => tempDir,
        saveRestartArgs: () => {},
        logger: logger as any,
        process: proc as any,
      }

      // Start multiple services
      await up({ namespace: 'frontend', detached: true }, upDeps)
      await up({ namespace: 'backend', detached: true }, upDeps)
      await up({ namespace: 'database', detached: true }, upDeps)

      expect(runningProcesses.length).toBe(3)

      // Stop all with down --all
      await down(
        { all: true },
        {
          MonitorClass: createMockMonitor() as any,
          logger: logger as any,
          findProjectRoot: () => tempDir,
        }
      )

      expect(runningProcesses.length).toBe(0)
    })

    test('foreground mode does not interfere with detached processes', async () => {
      const logger = createMockLogger()
      const proc = createMockProcess()

      // Start detached process
      await up(
        { namespace: 'detached', detached: true },
        {
          MonitorClass: createMockMonitor() as any,
          findProjectRoot: () => tempDir,
          saveRestartArgs: () => {},
          logger: logger as any,
          process: proc as any,
        }
      )

      expect(runningProcesses.length).toBe(1)

      // Run foreground process (different namespace)
      let foregroundRan = false
      await up(
        { namespace: 'foreground' },
        {
          MonitorClass: createMockMonitor() as any,
          findProjectRoot: () => tempDir,
          saveRestartArgs: () => {},
          logger: logger as any,
          runCommand: async () => {
            foregroundRan = true
          },
        }
      )

      expect(foregroundRan).toBe(true)
      expect(runningProcesses.length).toBe(1) // Still only detached process
      expect(runningProcesses[0].namespace).toBe('detached')
    })

    test('backward compatibility: up behaves like start', async () => {
      const logger = createMockLogger()
      const proc = createMockProcess()

      const deps: UpDeps = {
        MonitorClass: createMockMonitor() as any,
        findProjectRoot: () => tempDir,
        saveRestartArgs: (root, ns, args) => {
          saveRestartArgs(root, ns, args)
        },
        logger: logger as any,
        process: proc as any,
      }

      // up -d should behave like start -d
      await up({ namespace: 'compat-test', detached: true, feature: 'auth' }, deps)

      expect(runningProcesses.length).toBe(1)
      expect(runningProcesses[0].namespace).toBe('compat-test')

      // Verify restart args were saved (like start does)
      const savedArgs = loadRestartArgs(tempDir, 'compat-test')
      expect(savedArgs).not.toBeNull()
    })

    test('backward compatibility: down behaves like stop', async () => {
      // Start process
      const monitor = new (createMockMonitor() as any)(tempDir)
      await monitor.start('compat-stop', [])

      const logger = createMockLogger()

      // down should behave like stop
      await down(
        { namespace: 'compat-stop' },
        {
          MonitorClass: createMockMonitor() as any,
          logger: logger as any,
          findProjectRoot: () => tempDir,
        }
      )

      expect(runningProcesses.length).toBe(0)
    })
  })

  // ============================================================================
  // ERROR HANDLING TESTS
  // ============================================================================

  describe('error handling', () => {
    test('up validates namespace argument', async () => {
      const logger = createMockLogger()
      const proc = createMockProcess()

      await up(
        { namespace: '', detached: true },
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

    test('down handles missing processes gracefully', async () => {
      const logger = createMockLogger()

      // Try to stop when nothing is running
      await down(
        { all: true },
        {
          MonitorClass: createMockMonitor() as any,
          logger: logger as any,
          findProjectRoot: () => tempDir,
        }
      )

      // Should not throw, just inform user
      expect((logger.info as any).mock.calls.length).toBeGreaterThan(0)
    })

    test('up with invalid options passes through to run command', async () => {
      let capturedError: any = null
      const logger = createMockLogger()

      const deps: UpDeps = {
        MonitorClass: createMockMonitor() as any,
        findProjectRoot: () => tempDir,
        saveRestartArgs: () => {},
        logger: logger as any,
        runCommand: async (opts) => {
          // Run command will handle validation
          if (!opts.backend && opts.repo) {
            throw new Error('--repo requires --backend github')
          }
        },
      }

      try {
        await up({ namespace: 'invalid', repo: 'owner/repo' }, deps)
      } catch (err) {
        capturedError = err
      }

      expect(capturedError).not.toBeNull()
      expect(capturedError.message).toContain('github')
    })
  })
})
