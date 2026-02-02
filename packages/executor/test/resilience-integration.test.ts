import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test'
import { CliExecutor } from '../src/cli-executor'
import fs from 'fs'
import os from 'os'
import path from 'path'

const mockProcessManager = {
  spawn: mock((..._args: any[]) => ({
    stdout: { on: mock() },
    stderr: { on: mock() },
    stdin: { write: mock(), end: mock() },
    on: mock(),
    kill: mock()
  })),
  kill: mock(),
  cleanup: mock()
}

const mockPluginRegistry = {
  runHook: mock(() => Promise.resolve()),
  getCapabilityRegistry: mock(() => ({
    getPromptInjection: mock(() => '')
  }))
}

const mockLogger = {
  info: mock(),
  warn: mock(),
  error: mock(),
  debug: mock(),
  startSpinner: mock(() => ({ stop: mock() })),
  update: mock()
}

class MockProcess {
  stdout = { on: mock() }
  stderr = { on: mock() }
  stdin = { write: mock(), end: mock() }
  callbacks: Record<string, Function[]> = {}

  on(event: string, cb: Function) {
    if (!this.callbacks[event]) this.callbacks[event] = []
    this.callbacks[event].push(cb)
  }

  emit(event: string, ...args: any[]) {
    this.callbacks[event]?.forEach(cb => cb(...args))
  }

  kill() {}
}

describe('CliExecutor Resilience Integration', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `loopwork-test-${Math.random().toString(36).slice(2)}`)
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })
  })

  afterEach(() => {
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test('should switch to fallback on quota exceeded error', async () => {
    const executor = new CliExecutor(
      { 
        cliPaths: { opencode: '/usr/bin/opencode', claude: '/usr/bin/claude' },
        models: [{ name: 'primary', cli: 'opencode', model: 'p1' }],
        fallbackModels: [{ name: 'fallback', cli: 'claude', model: 'f1' }],
        retry: { 
          rateLimitWaitMs: 1,
          delayBetweenModelAttemptsMs: 1
        }
      } as any,
      mockProcessManager as any,
      mockPluginRegistry as any,
      mockLogger as any
    )

    let spawnCount = 0
    let lastCli: string = ''

    mockProcessManager.spawn = mock((command: string, _args: string[]) => {
      spawnCount++
      const currentSpawn = spawnCount
      lastCli = command.includes('opencode') ? 'opencode' : 'claude'
      const proc = new MockProcess()
      
      setTimeout(() => {
        const filePath = path.join(tempDir, 'test-quota.log')
        if (currentSpawn === 1) {
          fs.writeFileSync(filePath, 'Error: quota exceeded for model')
        } else {
          fs.writeFileSync(filePath, 'Success')
        }
        proc.emit('close', 0)
      }, 10)
      
      return proc as any
    })

    const task = { id: 'TASK-QUOTA', title: 'Test Quota' }
    await executor.executeTask(task, 'Test prompt', `${tempDir}/test-quota.log`, 60)

    expect(spawnCount).toBe(2)
    expect(lastCli).toBe('claude')
  })
})
