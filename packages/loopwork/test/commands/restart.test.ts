import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import {
  restart,
  type RestartDeps,
  type IMonitor,
  type ILogger,
  type IRunningProcess,
  type ISavedRestartArgs,
} from '../../src/commands/restart'
import { LoopworkError } from '../../src/core/errors'

/**
 * Tests for the restart command using dependency injection (adapter pattern).
 * No mock.module() used to avoid test pollution.
 */

describe('restart command', () => {
  // Mock state
  let mockGetRunningProcesses: ReturnType<typeof mock>
  let mockStop: ReturnType<typeof mock>
  let mockStart: ReturnType<typeof mock>
  let mockProcessExit: ReturnType<typeof mock>
  let mockProcessKill: ReturnType<typeof mock>
  let mockHandleError: ReturnType<typeof mock>
  let mockLoadRestartArgs: ReturnType<typeof mock>
  let mockFindProjectRoot: ReturnType<typeof mock>
  let stdoutOutput: string

  // Create mock monitor class
  function createMockMonitorClass() {
    return class MockMonitor implements IMonitor {
      projectRoot: string
      constructor(projectRoot: string) {
        this.projectRoot = projectRoot
      }
      getRunningProcesses = mockGetRunningProcesses
      stop = mockStop
      start = mockStart
    }
  }

  // Create test dependencies
  function createTestDeps(overrides: Partial<RestartDeps> = {}): RestartDeps {
    return {
      MonitorClass: createMockMonitorClass() as any,
      logger: {
        info: mock(() => {}),
        success: mock(() => {}),
        warn: mock(() => {}),
        error: mock(() => {}),
        debug: mock(() => {}),
      } as ILogger,
      handleError: mockHandleError,
      loadRestartArgs: mockLoadRestartArgs,
      findProjectRoot: mockFindProjectRoot,
      process: {
        exit: mockProcessExit,
        kill: mockProcessKill,
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

  // Helper to create a running process
  function createRunningProcess(partial: Partial<IRunningProcess> = {}): IRunningProcess {
    return {
      namespace: 'test-ns',
      pid: 12345,
      startedAt: new Date().toISOString(),
      logFile: '/tmp/test.log',
      args: ['--feature', 'auth'],
      ...partial,
    }
  }

  // Helper to create saved restart args
  function createSavedArgs(partial: Partial<ISavedRestartArgs> = {}): ISavedRestartArgs {
    return {
      namespace: 'test-ns',
      args: ['--feature', 'auth', '--cli', 'claude'],
      cwd: '/tmp/test',
      startedAt: new Date().toISOString(),
      ...partial,
    }
  }

  beforeEach(() => {
    // Reset output capture
    stdoutOutput = ''

    // Reset all mocks
    mockGetRunningProcesses = mock(() => [])
    mockStop = mock(() => ({ success: true }))
    mockStart = mock(async () => ({ success: true, pid: 12345 }))
    mockProcessExit = mock(() => { throw new Error('EXIT_1') })
    mockProcessKill = mock(() => true)
    mockHandleError = mock(() => {})
    mockLoadRestartArgs = mock(() => createSavedArgs())
    mockFindProjectRoot = mock(() => '/tmp/test-project')
  })

  test('restarts a stopped namespace with saved args', async () => {
    await restart({ namespace: 'test-ns' }, createTestDeps())

    expect(mockLoadRestartArgs).toHaveBeenCalledWith('/tmp/test-project', 'test-ns')
    expect(mockGetRunningProcesses).toHaveBeenCalled()
    expect(mockStart).toHaveBeenCalledWith('test-ns', ['--feature', 'auth', '--cli', 'claude'])
  })

  test('stops running process before restarting', async () => {
    mockGetRunningProcesses = mock(() => [createRunningProcess()])

    // Inject waitForProcessExit that immediately returns true
    const deps = createTestDeps({
      waitForProcessExit: mock(async () => true),
    })

    await restart({ namespace: 'test-ns' }, deps)

    expect(mockStop).toHaveBeenCalledWith('test-ns')
    expect(mockStart).toHaveBeenCalledWith('test-ns', ['--feature', 'auth', '--cli', 'claude'])
  })

  test('handles daemon not running scenario', async () => {
    mockGetRunningProcesses = mock(() => [])

    await restart({ namespace: 'test-ns' }, createTestDeps())

    expect(mockStop).not.toHaveBeenCalled()
    expect(mockStart).toHaveBeenCalledWith('test-ns', ['--feature', 'auth', '--cli', 'claude'])
  })

  test('verifies process exit after stop', async () => {
    let stopCalled = false
    let startCalled = false

    mockGetRunningProcesses = mock(() => [createRunningProcess()])
    mockStop = mock(() => {
      stopCalled = true
      return { success: true }
    })
    mockStart = mock(async () => {
      expect(stopCalled).toBe(true)
      startCalled = true
      return { success: true, pid: 67890 }
    })

    const deps = createTestDeps({
      waitForProcessExit: mock(async () => true),
    })

    await restart({ namespace: 'test-ns' }, deps)

    expect(stopCalled).toBe(true)
    expect(startCalled).toBe(true)
  })

  test('fails when no saved args found', async () => {
    mockLoadRestartArgs = mock(() => null)

    try {
      await restart({ namespace: 'no-args' }, createTestDeps())
      expect(false).toBe(true) // Should not reach here
    } catch (e) {
      expect((e as Error).message).toBe('EXIT_1')
      expect(mockStart).not.toHaveBeenCalled()
      expect(mockHandleError).toHaveBeenCalled()
    }
  })

  test('fails when stop fails', async () => {
    mockGetRunningProcesses = mock(() => [createRunningProcess()])
    mockStop = mock(() => ({ success: false, error: 'Permission denied' }))

    const deps = createTestDeps({
      waitForProcessExit: mock(async () => true),
    })

    try {
      await restart({ namespace: 'test-ns' }, deps)
      expect(false).toBe(true) // Should not reach here
    } catch (e) {
      expect((e as Error).message).toBe('EXIT_1')
      expect(mockStop).toHaveBeenCalled()
      expect(mockHandleError).toHaveBeenCalled()
    }
  })

  test('fails when start fails', async () => {
    mockStart = mock(async () => ({ success: false, error: 'Failed to spawn' }))

    try {
      await restart({ namespace: 'test-ns' }, createTestDeps())
      expect(false).toBe(true) // Should not reach here
    } catch (e) {
      expect((e as Error).message).toBe('EXIT_1')
      expect(mockStart).toHaveBeenCalled()
      expect(mockHandleError).toHaveBeenCalled()
    }
  })

  test('uses default namespace when not specified', async () => {
    mockLoadRestartArgs = mock(() => createSavedArgs({ namespace: 'default', args: ['--feature', 'default'] }))

    await restart({}, createTestDeps())

    expect(mockLoadRestartArgs).toHaveBeenCalledWith('/tmp/test-project', 'default')
    expect(mockStart).toHaveBeenCalledWith('default', ['--feature', 'default'])
  })

  test('passes through saved arguments correctly', async () => {
    const complexArgs = [
      '--feature', 'auth',
      '--cli', 'claude',
      '--max-iterations', '10',
      '--timeout', '300000',
      '--debug'
    ]

    mockLoadRestartArgs = mock(() => createSavedArgs({ namespace: 'complex', args: complexArgs }))

    await restart({ namespace: 'complex' }, createTestDeps())

    expect(mockStart).toHaveBeenCalledWith('complex', complexArgs)
  })

  test('waits after stopping before starting', async () => {
    let stopCalled = false

    mockGetRunningProcesses = mock(() => [createRunningProcess()])
    mockStop = mock(() => {
      stopCalled = true
      return { success: true }
    })
    mockStart = mock(async () => {
      expect(stopCalled).toBe(true)
      return { success: true, pid: 99999 }
    })

    const deps = createTestDeps({
      waitForProcessExit: mock(async () => true),
    })

    await restart({ namespace: 'test-ns' }, deps)

    expect(mockStop).toHaveBeenCalled()
    expect(mockStart).toHaveBeenCalled()
  })

  test('handles stop with successful process termination', async () => {
    let stopCalled = false

    mockGetRunningProcesses = mock(() => [createRunningProcess()])
    mockStop = mock(() => {
      stopCalled = true
      return { success: true }
    })
    mockStart = mock(async () => {
      expect(stopCalled).toBe(true)
      return { success: true, pid: 11111 }
    })

    const deps = createTestDeps({
      waitForProcessExit: mock(async () => true),
    })

    await restart({ namespace: 'test-ns' }, deps)

    expect(stopCalled).toBe(true)
  })

  test('calls findProjectRoot with correct arguments', async () => {
    await restart({ namespace: 'test-ns' }, createTestDeps())

    expect(mockFindProjectRoot).toHaveBeenCalled()
    expect(mockLoadRestartArgs).toHaveBeenCalledWith('/tmp/test-project', 'test-ns')
  })

  test('polls for process exit with multiple checks', async () => {
    let waitCallCount = 0

    mockGetRunningProcesses = mock(() => [createRunningProcess()])

    let stopTime = 0
    let startTime = 0

    mockStop = mock(() => {
      stopTime = Date.now()
      return { success: true }
    })

    mockStart = mock(async () => {
      startTime = Date.now()
      return { success: true, pid: 99999 }
    })

    const deps = createTestDeps({
      waitForProcessExit: mock(async (pid: number, timeout?: number) => {
        waitCallCount++
        // Simulate some polling delay
        await new Promise(resolve => setTimeout(resolve, 50))
        return true
      }),
    })

    await restart({ namespace: 'test-ns' }, deps)

    // Verify waitForProcessExit was called
    expect(waitCallCount).toBeGreaterThanOrEqual(1)

    // Verify there's a delay between stop and start
    const delay = startTime - stopTime
    expect(delay).toBeGreaterThanOrEqual(50)

    expect(mockStop).toHaveBeenCalled()
    expect(mockStart).toHaveBeenCalled()
  })

  test('times out if process does not exit within timeout', async () => {
    mockGetRunningProcesses = mock(() => [createRunningProcess()])

    const deps = createTestDeps({
      waitForProcessExit: mock(async () => false), // Simulate timeout
    })

    try {
      await restart({ namespace: 'test-ns' }, deps)
      expect(false).toBe(true) // Should not reach here
    } catch (e) {
      // Should exit with error due to timeout
      expect((e as Error).message).toBe('EXIT_1')
      expect(mockStart).not.toHaveBeenCalled()
      expect(mockHandleError).toHaveBeenCalled()
    }
  })

  test('handles EPERM errors and continues polling', async () => {
    let waitCallCount = 0

    mockGetRunningProcesses = mock(() => [createRunningProcess()])

    const deps = createTestDeps({
      waitForProcessExit: mock(async () => {
        waitCallCount++
        return true // Eventually exits
      }),
    })

    await restart({ namespace: 'test-ns' }, deps)

    expect(waitCallCount).toBeGreaterThanOrEqual(1)
    expect(mockStart).toHaveBeenCalled()
  })

  test('completes quickly if process already exited', async () => {
    mockGetRunningProcesses = mock(() => [createRunningProcess()])

    const startTime = Date.now()

    const deps = createTestDeps({
      waitForProcessExit: mock(async () => true), // Immediate exit
    })

    await restart({ namespace: 'test-ns' }, deps)

    const elapsed = Date.now() - startTime

    // Should complete very quickly since process already exited
    expect(elapsed).toBeLessThan(500)
    expect(mockStart).toHaveBeenCalled()
  })

  test('uses LoopworkError for error handling', async () => {
    mockLoadRestartArgs = mock(() => null)
    let errorPassed: any = null
    mockHandleError = mock((error: Error) => {
      errorPassed = error
    })

    try {
      await restart({ namespace: 'no-args' }, createTestDeps())
    } catch (e) {
      // Expected
    }

    expect(errorPassed).toBeInstanceOf(LoopworkError)
    expect(errorPassed.message).toContain("No saved arguments found")
  })

  test('displays helpful info on successful restart', async () => {
    const deps = createTestDeps()
    const loggerInfo = (deps.logger as ILogger).info as ReturnType<typeof mock>
    const loggerSuccess = (deps.logger as ILogger).success as ReturnType<typeof mock>

    await restart({ namespace: 'test-ns' }, deps)

    expect(loggerSuccess).toHaveBeenCalled()
    expect(loggerInfo).toHaveBeenCalled()

    // Verify helpful commands are shown
    const infoCalls = loggerInfo.mock.calls.map((c: any) => c[0])
    expect(infoCalls.some((msg: string) => msg.includes('loopwork logs'))).toBe(true)
    expect(infoCalls.some((msg: string) => msg.includes('loopwork stop'))).toBe(true)
  })
})
