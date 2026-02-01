import { describe, test, expect, beforeEach } from 'bun:test'
import { MockCliExecutor } from '../src/mocks/cli'
import fs from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'

describe('MockCliExecutor', () => {
  let executor: MockCliExecutor
  let tempDir: string

  beforeEach(async () => {
    executor = new MockCliExecutor()
    tempDir = path.join(tmpdir(), `test-${Date.now()}`)
    await fs.mkdir(tempDir, { recursive: true })
  })

  describe('basic execution', () => {
    test('execute returns default exit code', async () => {
      const exitCode = await executor.execute('test prompt', '', 60)
      expect(exitCode).toBe(0)
    })

    test('execute writes response to output file', async () => {
      const outputFile = path.join(tempDir, 'output.txt')
      executor.setDefaultResponse('Test response')

      await executor.execute('test prompt', outputFile, 60)

      const content = await fs.readFile(outputFile, 'utf-8')
      expect(content).toBe('Test response')
    })

    test('execute logs execution', async () => {
      await executor.execute('test prompt', '', 60, { taskId: 'TASK-001' })

      const logs = executor.getExecutionLogs()
      expect(logs.length).toBe(1)
      expect(logs[0].prompt).toBe('test prompt')
      expect(logs[0].options?.taskId).toBe('TASK-001')
    })
  })

  describe('pattern matching', () => {
    test('addPattern matches regex and returns custom response', async () => {
      executor.addPattern(/create.*file/, 'File created successfully')
      
      const exitCode = await executor.execute('create a new file', '', 60)
      expect(exitCode).toBe(0)

      const lastExecution = executor.getLastExecution()
      expect(lastExecution?.response).toBe('File created successfully')
    })

    test('addPattern supports function responses', async () => {
      executor.addPattern(
        /echo (.+)/,
        (prompt: string) => {
          const match = prompt.match(/echo (.+)/)
          return match ? match[1] : 'no match'
        }
      )

      await executor.execute('echo Hello World', '', 60)

      const lastExecution = executor.getLastExecution()
      expect(lastExecution?.response).toBe('Hello World')
    })

    test('addPattern supports custom exit codes', async () => {
      executor.addPattern(/fail/, 'Task failed', 1)

      const exitCode = await executor.execute('fail this task', '', 60)
      expect(exitCode).toBe(1)
    })

    test('multiple patterns are tried in order', async () => {
      executor.addPattern(/first/, 'First match')
      executor.addPattern(/second/, 'Second match')
      executor.addPattern(/.*/, 'Fallback match')

      await executor.execute('second pattern', '', 60)
      const lastExecution = executor.getLastExecution()
      expect(lastExecution?.response).toBe('Second match')
    })
  })

  describe('timeout simulation', () => {
    test('setTimeoutBehavior causes execution to timeout', async () => {
      executor.setTimeoutBehavior(true, 100)

      let threw = false
      try {
        await executor.execute('test', '', 1)
      } catch (error) {
        threw = true
        expect((error as Error).message).toContain('timeout')
      }

      expect(threw).toBe(true)
    })
  })

  describe('executeTask', () => {
    test('executeTask extracts task metadata', async () => {
      const task = {
        id: 'TASK-001',
        priority: 'high',
        feature: 'auth',
      }

      await executor.executeTask(task, 'test prompt', '', 60)

      const lastExecution = executor.getLastExecution()
      expect(lastExecution?.options?.taskId).toBe('TASK-001')
      expect(lastExecution?.options?.priority).toBe('high')
      expect(lastExecution?.options?.feature).toBe('auth')
    })
  })

  describe('execution tracking', () => {
    test('getExecutionCount returns correct count', async () => {
      expect(executor.getExecutionCount()).toBe(0)

      await executor.execute('test 1', '', 60)
      expect(executor.getExecutionCount()).toBe(1)

      await executor.execute('test 2', '', 60)
      expect(executor.getExecutionCount()).toBe(2)
    })

    test('getExecutionsByTaskId filters by task ID', async () => {
      await executor.execute('test 1', '', 60, { taskId: 'TASK-001' })
      await executor.execute('test 2', '', 60, { taskId: 'TASK-002' })
      await executor.execute('test 3', '', 60, { taskId: 'TASK-001' })

      const task001Executions = executor.getExecutionsByTaskId('TASK-001')
      expect(task001Executions.length).toBe(2)
      expect(task001Executions.every(e => e.options?.taskId === 'TASK-001')).toBe(true)
    })

    test('clearLogs removes all execution logs', async () => {
      await executor.execute('test 1', '', 60)
      await executor.execute('test 2', '', 60)

      executor.clearLogs()

      expect(executor.getExecutionLogs().length).toBe(0)
      expect(executor.getExecutionCount()).toBe(0)
    })
  })

  describe('process management', () => {
    test('killCurrent clears current PID', async () => {
      await executor.execute('test', '', 60)
      expect(executor.getCurrentPid()).toBeDefined()

      executor.killCurrent()
      expect(executor.getCurrentPid()).toBeUndefined()
    })

    test('cleanup clears state', async () => {
      await executor.execute('test', '', 60)

      await executor.cleanup()

      expect(executor.getCurrentPid()).toBeUndefined()
      expect(executor.getExecutionCount()).toBe(0)
    })
  })

  describe('reset', () => {
    test('reset clears all state', async () => {
      executor.addPattern(/test/, 'Custom response')
      executor.setDefaultResponse('Custom default', 1)
      executor.setTimeoutBehavior(true, 1000)
      
      try {
        await executor.execute('test', '', 60)
      } catch {
        // Expected timeout
      }

      executor.reset()

      expect(executor.getExecutionCount()).toBe(0)
      expect(executor.getCurrentPid()).toBeUndefined()

      const exitCode = await executor.execute('test', '', 60)
      expect(exitCode).toBe(0)

      const lastExecution = executor.getLastExecution()
      expect(lastExecution?.response).toBe('Mock CLI response')
    })
  })

  describe('delay simulation', () => {
    test('pattern delay causes execution to wait', async () => {
      executor.addPattern(/slow/, 'Slow response', 0, 100)

      const start = Date.now()
      await executor.execute('slow task', '', 60)
      const duration = Date.now() - start

      expect(duration).toBeGreaterThanOrEqual(90)
    })
  })
})
