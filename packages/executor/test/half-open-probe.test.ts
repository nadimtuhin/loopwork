import { describe, test, expect, mock } from 'bun:test'
import { CliExecutor } from '../src/cli-executor'

function makeExecutor() {
  const processManager = { spawn: mock(() => ({})), cleanup: mock(async () => {}) }
  const pluginRegistry = {
    runHook: mock(async () => {}),
    getCapabilityRegistry: () => ({ getPromptInjection: () => '' }),
  }
  const logger = {
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
    startSpinner: mock(() => {}),
    stopSpinner: mock(() => {}),
  }
  const executor = new CliExecutor(
    { models: [{ name: 'm1', cli: 'claude', model: 'sonnet' }], cliPaths: { claude: '/usr/bin/claude' } } as any,
    processManager as any,
    pluginRegistry as any,
    logger as any
  )
  // @ts-ignore private test setup
  executor.cliPaths.set('claude', '/usr/bin/claude')
  return executor
}

describe('CliExecutor circuit breaker accounting', () => {
  test('a timed-out run is recorded as a failure so it cannot leak a half-open probe', async () => {
    const executor = makeExecutor()
    // @ts-ignore private test setup
    executor.spawnWithTimeout = async () => ({ exitCode: 0, timedOut: true })

    await executor.execute('prompt', '/tmp/half-open-probe-output.txt', 5, { taskId: 'T-1' }).catch(() => {})

    // @ts-ignore private test access
    expect(executor.modelSelector.getCircuitBreakerState('m1')?.failures).toBe(1)
  })
})
