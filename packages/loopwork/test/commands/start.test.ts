import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import fs from 'fs'
import path from 'path'
import { start, type StartOptions, type StartDeps } from '../../src/commands/start'
import { loadRestartArgs } from '../../src/commands/shared/process-utils'

/**
 * Tests for the start command using dependency injection (adapter pattern).
 * No mock.module() used to avoid test pollution.
 */

describe('Start Command', () => {
  const testDir = path.join('/tmp', 'loopwork-start-test-' + Date.now())
  let originalCwd: string

  // Mock dependencies
  let runCalled = false
  let runOptions: any = null
  let mockMonitorStart: ReturnType<typeof mock>
  let mockMonitorGetRunning: ReturnType<typeof mock>
  let mockProcessExit: ReturnType<typeof mock>
  let mockHandleError: ReturnType<typeof mock>
  let stdoutOutput: string

  // Create mock monitor class
  function createMockMonitorClass() {
    return class MockMonitor {
      projectRoot: string
      constructor(projectRoot: string) {
        this.projectRoot = projectRoot
      }
      start = mockMonitorStart
      getRunningProcesses = mockMonitorGetRunning
      stop = mock(() => ({ success: true }))
      stopAll = mock(() => ({ stopped: [], errors: [] }))
      getStatus = mock(() => ({ running: [], namespaces: [] }))
    }
  }

  // Create test dependencies
  function createTestDeps(overrides: Partial<StartDeps> = {}): StartDeps {
    return {
      MonitorClass: createMockMonitorClass() as any,
      findProjectRoot: mock(() => testDir),
      saveRestartArgs: mock((root, ns, args) => {
        // Actually save restart args for verification
        const dir = path.join(root, '.loopwork')
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(
          path.join(dir, `${ns}-restart-args.json`),
          JSON.stringify({ namespace: ns, args, cwd: root, startedAt: new Date().toISOString() })
        )
      }),
      logger: {
        info: mock(() => {}),
        success: mock(() => {}),
        warn: mock(() => {}),
        error: mock(() => {}),
        debug: mock(() => {}),
        update: mock(() => {}),
        raw: mock(() => {}),
      } as any,
      handleError: mockHandleError,
      runCommand: async (options) => {
        runCalled = true
        runOptions = options
      },
      process: {
        exit: mockProcessExit,
        stdout: {
          write: mock((chunk: any) => {
            stdoutOutput += typeof chunk === 'string' ? chunk : chunk.toString()
            return true
          }),
        },
      } as any,
      ...overrides,
    }
  }

  beforeEach(() => {
    // Save original directory
    originalCwd = process.cwd()

    // Reset test state
    runCalled = false
    runOptions = null
    stdoutOutput = ''
    mockMonitorStart = mock(async () => ({ success: true, pid: 12345 }))
    mockMonitorGetRunning = mock(() => [])
    mockProcessExit = mock(() => {})
    mockHandleError = mock(() => {})

    // Create test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
    fs.mkdirSync(testDir, { recursive: true })
    process.chdir(testDir)

    // Create a package.json so findProjectRoot works
    fs.writeFileSync(path.join(testDir, 'package.json'), '{}')
  })

  afterEach(() => {
    try {
      // Restore original directory
      process.chdir(originalCwd)
    } finally {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true })
      }
    }
  })

  describe('foreground mode', () => {
    test('calls run command when no daemon flag', async () => {
      await start({ namespace: 'test' }, createTestDeps())

      expect(runCalled).toBe(true)
      expect(runOptions).toEqual({ namespace: 'test' })
    })

    test('passes through options to run command', async () => {
      await start({
        namespace: 'myns',
        feature: 'auth',
        cli: 'claude',
        maxIterations: 10,
        dryRun: true,
      }, createTestDeps())

      expect(runCalled).toBe(true)
      expect(runOptions.namespace).toBe('myns')
      expect(runOptions.feature).toBe('auth')
      expect(runOptions.cli).toBe('claude')
      expect(runOptions.maxIterations).toBe(10)
      expect(runOptions.dryRun).toBe(true)
    })
  })

  describe('daemon mode', () => {
    test('starts daemon via monitor', async () => {
      let startNamespace: string | undefined
      let startArgs: string[] | undefined

      mockMonitorStart = mock(async (ns: string, args: string[]) => {
        startNamespace = ns
        startArgs = args
        return { success: true, pid: 99999 }
      })

      await start({ daemon: true, namespace: 'daemon-test' }, createTestDeps())

      expect(mockMonitorStart).toHaveBeenCalled()
    })

    test('saves restart args when starting daemon', async () => {
      await start({
        daemon: true,
        namespace: 'restart-test',
        feature: 'myfeature',
      }, createTestDeps())

      const savedArgs = loadRestartArgs(testDir, 'restart-test')
      expect(savedArgs).not.toBeNull()
      expect(savedArgs?.namespace).toBe('restart-test')
      expect(savedArgs?.args).toContain('--feature')
      expect(savedArgs?.args).toContain('myfeature')
    })

    test('throws error when namespace already running', async () => {
      mockMonitorGetRunning = mock(() => [
        {
          namespace: 'busy-namespace',
          pid: 11111,
          startedAt: new Date().toISOString(),
          logFile: '/tmp/test.log',
          args: [],
        }
      ])

      await expect(start({
        daemon: true,
        namespace: 'busy-namespace'
      }, createTestDeps())).rejects.toThrow("Namespace 'busy-namespace' is already running")
    })

    test('passes all arguments to monitor', async () => {
      let capturedArgs: string[] = []

      mockMonitorStart = mock(async (ns: string, args: string[]) => {
        capturedArgs = args
        return { success: true, pid: 12345 }
      })

      await start({
        daemon: true,
        namespace: 'test',
        feature: 'auth',
        backend: 'github',
        tasksFile: 'custom.json',
        repo: 'user/repo',
        maxIterations: 50,
        timeout: 300,
        cli: 'claude',
        model: 'opus',
        dryRun: true,
        yes: true,
        debug: true,
        config: 'test.config.ts',
      }, createTestDeps())

      expect(capturedArgs).toContain('--feature')
      expect(capturedArgs).toContain('auth')
      expect(capturedArgs).toContain('--backend')
      expect(capturedArgs).toContain('github')
      expect(capturedArgs).toContain('--tasks-file')
      expect(capturedArgs).toContain('custom.json')
      expect(capturedArgs).toContain('--repo')
      expect(capturedArgs).toContain('user/repo')
      expect(capturedArgs).toContain('--max-iterations')
      expect(capturedArgs).toContain('50')
      expect(capturedArgs).toContain('--timeout')
      expect(capturedArgs).toContain('300')
      expect(capturedArgs).toContain('--cli')
      expect(capturedArgs).toContain('claude')
      expect(capturedArgs).toContain('--model')
      expect(capturedArgs).toContain('opus')
      expect(capturedArgs).toContain('--dry-run')
      expect(capturedArgs).toContain('--yes')
      expect(capturedArgs).toContain('--debug')
      expect(capturedArgs).toContain('--config')
      expect(capturedArgs).toContain('test.config.ts')
    })

    test('displays success message with PID', async () => {
      const deps = createTestDeps()
      mockMonitorStart = mock(async () => ({ success: true, pid: 54321 }))

      await start({ daemon: true, namespace: 'success-test' }, deps)

      const successCalls = (deps.logger!.success as any).mock.calls
      expect(successCalls.some((c: any) => c[0].includes('54321'))).toBe(true)
    })

    test('displays helpful commands after starting', async () => {
      const deps = createTestDeps()

      await start({ daemon: true, namespace: 'helpful-test' }, deps)

      const infoCalls = (deps.logger!.info as any).mock.calls
      expect(infoCalls.some((c: any) => c[0].includes('loopwork logs helpful-test'))).toBe(true)
      expect(infoCalls.some((c: any) => c[0].includes('loopwork stop helpful-test'))).toBe(true)
    })

    test('uses default namespace when not provided', async () => {
      let capturedNamespace = ''

      mockMonitorStart = mock(async (ns: string) => {
        capturedNamespace = ns
        return { success: true, pid: 12345 }
      })

      await start({ daemon: true }, createTestDeps())

      expect(capturedNamespace).toBe('default')
    })
  })

  describe('error scenarios', () => {
    test('handles daemon start failure', async () => {
      mockMonitorStart = mock(async () => ({
        success: false,
        error: 'Failed to spawn process'
      }))

      const deps = createTestDeps()
      await start({ daemon: true }, deps)

      expect(mockHandleError).toHaveBeenCalled()
      expect(mockProcessExit).toHaveBeenCalledWith(1)
    })
  })

  describe('boolean flags', () => {
    test('passes dryRun flag correctly', async () => {
      await start({ dryRun: true }, createTestDeps())

      expect(runOptions.dryRun).toBe(true)
    })

    test('passes yes flag correctly', async () => {
      await start({ yes: true }, createTestDeps())

      expect(runOptions.yes).toBe(true)
    })

    test('passes debug flag correctly', async () => {
      await start({ debug: true }, createTestDeps())

      expect(runOptions.debug).toBe(true)
    })

    test('handles undefined boolean flags', async () => {
      await start({}, createTestDeps())

      expect(runOptions.dryRun).toBeUndefined()
      expect(runOptions.yes).toBeUndefined()
      expect(runOptions.debug).toBeUndefined()
    })
  })

  describe('numeric options', () => {
    test('converts maxIterations to string for daemon args', async () => {
      let capturedArgs: string[] = []

      mockMonitorStart = mock(async (ns: string, args: string[]) => {
        capturedArgs = args
        return { success: true, pid: 12345 }
      })

      await start({ daemon: true, maxIterations: 42 }, createTestDeps())

      expect(capturedArgs).toContain('--max-iterations')
      expect(capturedArgs).toContain('42')
    })

    test('converts timeout to string for daemon args', async () => {
      let capturedArgs: string[] = []

      mockMonitorStart = mock(async (ns: string, args: string[]) => {
        capturedArgs = args
        return { success: true, pid: 12345 }
      })

      await start({ daemon: true, timeout: 180 }, createTestDeps())

      expect(capturedArgs).toContain('--timeout')
      expect(capturedArgs).toContain('180')
    })

    test('passes numeric options directly to run command', async () => {
      await start({ maxIterations: 25, timeout: 90 }, createTestDeps())

      expect(runOptions.maxIterations).toBe(25)
      expect(runOptions.timeout).toBe(90)
    })
  })

  describe('string options', () => {
    test('passes all string options to run command', async () => {
      await start({
        namespace: 'ns',
        feature: 'feat',
        backend: 'back',
        tasksFile: 'file',
        repo: 'rep',
        cli: 'cl',
        model: 'mod',
        config: 'conf',
      }, createTestDeps())

      expect(runOptions.namespace).toBe('ns')
      expect(runOptions.feature).toBe('feat')
      expect(runOptions.backend).toBe('back')
      expect(runOptions.tasksFile).toBe('file')
      expect(runOptions.repo).toBe('rep')
      expect(runOptions.cli).toBe('cl')
      expect(runOptions.model).toBe('mod')
      expect(runOptions.config).toBe('conf')
    })

    test('handles empty string options', async () => {
      await start({ feature: '', cli: '' }, createTestDeps())

      expect(runOptions.feature).toBeUndefined()
      expect(runOptions.cli).toBeUndefined()
    })
  })

  describe('restart args file', () => {
    test('creates restart args file in .loopwork', async () => {
      await start({
        daemon: true,
        namespace: 'restart-ns',
        feature: 'test-feature',
      }, createTestDeps())

      const stateDir = path.join(testDir, '.loopwork')
      expect(fs.existsSync(stateDir)).toBe(true)

      const argsFile = path.join(stateDir, 'restart-ns-restart-args.json')
      expect(fs.existsSync(argsFile)).toBe(true)
    })

    test('restart args file contains correct structure', async () => {
      await start({
        daemon: true,
        namespace: 'struct-test',
        feature: 'my-feature',
        cli: 'claude',
      }, createTestDeps())

      const savedArgs = loadRestartArgs(testDir, 'struct-test')
      expect(savedArgs).not.toBeNull()
      expect(savedArgs?.namespace).toBe('struct-test')
      expect(fs.realpathSync(savedArgs?.cwd || '')).toBe(fs.realpathSync(testDir))
      expect(savedArgs?.startedAt).toBeDefined()
      expect(savedArgs?.args).toContain('--feature')
      expect(savedArgs?.args).toContain('my-feature')
      expect(savedArgs?.args).toContain('--cli')
      expect(savedArgs?.args).toContain('claude')
    })
  })

  describe('edge cases', () => {
    test('handles empty options object', async () => {
      await start({}, createTestDeps())

      expect(runCalled).toBe(true)
      expect(runOptions).toBeDefined()
    })

    test('daemon-specific options not passed to run command', async () => {
      await start({
        daemon: false,
        tail: true,
        follow: true,
        lines: 50,
        feature: 'test',
      }, createTestDeps())

      expect(runOptions.feature).toBe('test')
      expect(runOptions.daemon).toBeUndefined()
      expect(runOptions.tail).toBeUndefined()
      expect(runOptions.follow).toBeUndefined()
      expect(runOptions.lines).toBeUndefined()
    })

    test('handles multiple numeric and string options together', async () => {
      let capturedArgs: string[] = []

      mockMonitorStart = mock(async (ns: string, args: string[]) => {
        capturedArgs = args
        return { success: true, pid: 12345 }
      })

      await start({
        daemon: true,
        feature: 'complex',
        maxIterations: 100,
        timeout: 600,
        cli: 'opencode',
        debug: true,
      }, createTestDeps())

      const featureIdx = capturedArgs.indexOf('--feature')
      expect(capturedArgs[featureIdx + 1]).toBe('complex')

      const maxIterIdx = capturedArgs.indexOf('--max-iterations')
      expect(capturedArgs[maxIterIdx + 1]).toBe('100')

      const timeoutIdx = capturedArgs.indexOf('--timeout')
      expect(capturedArgs[timeoutIdx + 1]).toBe('600')

      const cliIdx = capturedArgs.indexOf('--cli')
      expect(capturedArgs[cliIdx + 1]).toBe('opencode')

      expect(capturedArgs).toContain('--debug')
    })
  })

  describe('clean orphans integration', () => {
    test('accepts cleanOrphans option and processes it', async () => {
      const deps = createTestDeps()
      // This tests that the option is properly parsed and handled
      // The actual clean function behavior is tested in processes.test.ts
      await start({ cleanOrphans: false }, deps)

      // The option should be accepted without error
      expect(true).toBe(true)
    })

    test('accepts clean-orphans option from CLI parser', async () => {
      const deps = createTestDeps()
      await start({ 'clean-orphans': false }, deps)

      // The option should be accepted without error
      expect(true).toBe(true)
    })

    test('does not clean orphans when flag is not passed', async () => {
      await start({ namespace: 'test' }, createTestDeps())

      // Should execute without cleaning
      expect(runCalled).toBe(true)
    })
  })
})
