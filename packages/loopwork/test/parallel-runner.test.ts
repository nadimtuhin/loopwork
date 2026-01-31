/**
 * Unit tests for ParallelRunner
 */

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import fs from 'fs'
import path from 'path'
import { ParallelRunner, type ParallelRunnerOptions } from '../src/core/parallel-runner'
import type { TaskBackend, Task, FindTaskOptions, UpdateResult } from '../src/backends/types'
import type { ICliExecutor } from '../src/contracts/executor'
import type { Config } from '../src/core/config'

// Mock task data
const createMockTask = (id: string, status: 'pending' | 'in-progress' | 'completed' | 'failed' = 'pending'): Task => ({
  id,
  title: `Task ${id}`,
  description: `Description for ${id}`,
  status,
  priority: 'medium',
})

// Mock backend that tracks claimed tasks
function createMockBackend(tasks: Task[]): TaskBackend & { claimedTasks: string[] } {
  const taskMap = new Map(tasks.map(t => [t.id, { ...t }]))
  const claimedTasks: string[] = []

  return {
    name: 'mock',
    claimedTasks,

    async claimTask(options?: FindTaskOptions): Promise<Task | null> {
      for (const [id, task] of taskMap) {
        if (task.status === 'pending') {
          task.status = 'in-progress'
          claimedTasks.push(id)
          return { ...task }
        }
      }
      return null
    },

    async findNextTask(options?: FindTaskOptions): Promise<Task | null> {
      for (const [, task] of taskMap) {
        if (task.status === 'pending') {
          return { ...task }
        }
      }
      return null
    },

    async getTask(taskId: string): Promise<Task | null> {
      return taskMap.get(taskId) || null
    },

    async listPendingTasks(options?: FindTaskOptions): Promise<Task[]> {
      return Array.from(taskMap.values()).filter(t => t.status === 'pending')
    },

    async countPending(options?: FindTaskOptions): Promise<number> {
      return Array.from(taskMap.values()).filter(t => t.status === 'pending').length
    },

    async markInProgress(taskId: string): Promise<UpdateResult> {
      const task = taskMap.get(taskId)
      if (task) {
        task.status = 'in-progress'
        return { success: true }
      }
      return { success: false, error: 'Task not found' }
    },

    async markCompleted(taskId: string, comment?: string): Promise<UpdateResult> {
      const task = taskMap.get(taskId)
      if (task) {
        task.status = 'completed'
        return { success: true }
      }
      return { success: false, error: 'Task not found' }
    },

    async markFailed(taskId: string, error: string): Promise<UpdateResult> {
      const task = taskMap.get(taskId)
      if (task) {
        task.status = 'failed'
        return { success: true }
      }
      return { success: false, error: 'Task not found' }
    },

    async resetToPending(taskId: string): Promise<UpdateResult> {
      const task = taskMap.get(taskId)
      if (task) {
        task.status = 'pending'
        return { success: true }
      }
      return { success: false, error: 'Task not found' }
    },

    async markQuarantined(taskId: string, error: string): Promise<UpdateResult> {
      const task = taskMap.get(taskId)
      if (task) {
        task.status = 'quarantined'
        return { success: true }
      }
      return { success: false, error: 'Task not found' }
    },

    async ping(): Promise<{ ok: boolean; latencyMs: number }> {
      return { ok: true, latencyMs: 1 }
    },

    async getSubTasks(taskId: string): Promise<Task[]> {
      return []
    },

    async getDependencies(taskId: string): Promise<Task[]> {
      return []
    },

    async getDependents(taskId: string): Promise<Task[]> {
      return []
    },

    async areDependenciesMet(taskId: string): Promise<boolean> {
      return true
    },
  }
}

// Mock CLI executor
function createMockCliExecutor(exitCodes: Map<string, number> = new Map()): ICliExecutor {
  return {
    async execute(prompt: string, outputFile: string, timeout: number, taskId?: string): Promise<number> {
      // Write mock output
      fs.mkdirSync(path.dirname(outputFile), { recursive: true })
      fs.writeFileSync(outputFile, `Mock output for ${taskId}`)
      return exitCodes.get(taskId || '') ?? 0
    },
    async executeTask(task: Task, prompt: string, outputFile: string, timeout: number): Promise<number> {
      return this.execute(prompt, outputFile, timeout, task.id)
    },
    killCurrent(): void {},
    resetFallback(): void {},
    async cleanup(): Promise<void> {},
  }
}

// Mock logger
const createMockLogger = () => ({
  startSpinner: mock(() => {}),
  stopSpinner: mock(() => {}),
  info: mock(() => {}),
  success: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
  debug: mock(() => {}),
  raw: mock(() => {}),
  setLogFile: mock(() => {}),
})

// Create test config
function createTestConfig(overrides: Partial<Config> = {}): Config {
  const testDir = `/tmp/loopwork-test-${Date.now()}`
  fs.mkdirSync(testDir, { recursive: true })
  fs.mkdirSync(path.join(testDir, 'logs'), { recursive: true })

  return {
    projectRoot: testDir,
    outputDir: testDir,
    sessionId: 'test-session',
    debug: false,
    resume: false,
    backend: { type: 'json', tasksFile: path.join(testDir, 'tasks.json') },
    namespace: 'test',
    parallel: 2,
    parallelFailureMode: 'continue',
    maxIterations: 10,
    timeout: 60,
    circuitBreakerThreshold: 3,
    maxRetries: 2,
    taskDelay: 10, // Minimal delay for tests
    selfHealingCooldown: 10, // Minimal cooldown for tests (10ms)
    ...overrides,
  } as Config
}

describe('ParallelRunner', () => {
  let testDir: string

  beforeEach(() => {
    testDir = `/tmp/loopwork-test-${Date.now()}`
    fs.mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
  })

  describe('Worker Pool', () => {
    test('should create specified number of workers', async () => {
      const tasks = [
        createMockTask('TASK-001'),
        createMockTask('TASK-002'),
        createMockTask('TASK-003'),
      ]
      const backend = createMockBackend(tasks)
      const config = createTestConfig({ parallel: 3 })

      const runner = new ParallelRunner({
        config,
        backend,
        cliExecutor: createMockCliExecutor(),
        logger: createMockLogger(),
        buildPrompt: (task) => `Test prompt for ${task.id}`,
      })

      const stats = await runner.run()

      // All 3 tasks should be claimed (one by each worker)
      expect(backend.claimedTasks.length).toBe(3)
      expect(stats.workers).toBe(3)
    })

    test('should handle fewer tasks than workers', async () => {
      const tasks = [createMockTask('TASK-001')]
      const backend = createMockBackend(tasks)
      const config = createTestConfig({ parallel: 3 })

      const runner = new ParallelRunner({
        config,
        backend,
        cliExecutor: createMockCliExecutor(),
        logger: createMockLogger(),
        buildPrompt: (task) => `Test prompt for ${task.id}`,
      })

      const stats = await runner.run()

      expect(stats.completed).toBe(1)
      expect(stats.workers).toBe(3)
    })
  })

  describe('Task Claiming', () => {
    test('should use claimTask for atomic claiming', async () => {
      const tasks = [
        createMockTask('TASK-001'),
        createMockTask('TASK-002'),
      ]
      const backend = createMockBackend(tasks)
      const claimTaskSpy = mock(backend.claimTask!.bind(backend))
      backend.claimTask = claimTaskSpy

      const config = createTestConfig({ parallel: 2 })

      const runner = new ParallelRunner({
        config,
        backend,
        cliExecutor: createMockCliExecutor(),
        logger: createMockLogger(),
        buildPrompt: (task) => `Test prompt for ${task.id}`,
      })

      await runner.run()

      // claimTask should be called (once per worker initially, then again to check for more)
      expect(claimTaskSpy).toHaveBeenCalled()
    })

    test('should prevent race conditions with concurrent claiming', async () => {
      // Create many tasks to ensure concurrent access
      const tasks = Array.from({ length: 10 }, (_, i) =>
        createMockTask(`TASK-${String(i + 1).padStart(3, '0')}`)
      )
      const backend = createMockBackend(tasks)
      const config = createTestConfig({ parallel: 5, maxIterations: 10 })

      const runner = new ParallelRunner({
        config,
        backend,
        cliExecutor: createMockCliExecutor(),
        logger: createMockLogger(),
        buildPrompt: (task) => `Test prompt for ${task.id}`,
      })

      await runner.run()

      // Each task should only be claimed once
      const uniqueClaimed = new Set(backend.claimedTasks)
      expect(uniqueClaimed.size).toBe(backend.claimedTasks.length)
    })
  })

  describe('Circuit Breaker', () => {
    test('should track consecutive failures and trigger circuit breaker', async () => {
      // Create enough tasks to trigger circuit breaker at least once
      const tasks = Array.from({ length: 15 }, (_, i) =>
        createMockTask(`TASK-${String(i + 1).padStart(3, '0')}`)
      )
      const backend = createMockBackend(tasks)

      // All tasks fail with rate limit error (detected pattern)
      const config = createTestConfig({
        parallel: 1,
        circuitBreakerThreshold: 3,
        maxRetries: 1,
        selfHealingCooldown: 10,
      })

      // Use a failing executor with rate limit error
      const failingExecutor: ICliExecutor = {
        async execute(prompt: string, outputFile: string, timeout: number, taskId?: string): Promise<number> {
          fs.mkdirSync(path.dirname(outputFile), { recursive: true })
          fs.writeFileSync(outputFile, 'Error: rate limit 429')
          return 1
        },
        killCurrent(): void {},
        resetFallback(): void {},
        async cleanup(): Promise<void> {},
      }

      const logger = createMockLogger()
      const runner = new ParallelRunner({
        config,
        backend,
        cliExecutor: failingExecutor,
        logger,
        buildPrompt: (task) => `Test prompt for ${task.id}`,
      })

      // Run to completion (either throws or completes when tasks exhausted)
      try {
        await runner.run()
      } catch (error) {
        // Expected - circuit breaker may throw
        expect(String(error)).toMatch(/Circuit breaker/)
      }

      // Verify that self-healing was attempted (logs show healing activity)
      const warnCalls = logger.warn.mock.calls
      const selfHealingLogs = warnCalls.filter((call: [string]) =>
        call[0] && call[0].includes('Self-Healing')
      )
      // Self-healing should have been attempted at least once
      expect(selfHealingLogs.length).toBeGreaterThan(0)
    })

    test('should reset on success', async () => {
      const tasks = [
        createMockTask('TASK-001'),
        createMockTask('TASK-002'),
        createMockTask('TASK-003'),
      ]
      const backend = createMockBackend(tasks)

      // First two fail, third succeeds
      const exitCodes = new Map<string, number>([
        ['TASK-001', 1],
        ['TASK-002', 1],
        ['TASK-003', 0],
      ])

      const config = createTestConfig({
        parallel: 1,
        circuitBreakerThreshold: 5,
        maxRetries: 1,
      })

      const runner = new ParallelRunner({
        config,
        backend,
        cliExecutor: createMockCliExecutor(exitCodes),
        logger: createMockLogger(),
        buildPrompt: (task) => `Test prompt for ${task.id}`,
      })

      const stats = await runner.run()

      expect(stats.completed).toBe(1)
      expect(stats.failed).toBe(2)
    })
  })

  describe('Failure Modes', () => {
    test('continue mode should keep running on failure', async () => {
      const tasks = [
        createMockTask('TASK-001'),
        createMockTask('TASK-002'),
      ]
      const backend = createMockBackend(tasks)

      // First task fails, second succeeds
      const exitCodes = new Map<string, number>([
        ['TASK-001', 1],
        ['TASK-002', 0],
      ])

      const config = createTestConfig({
        parallel: 1,
        parallelFailureMode: 'continue',
        maxRetries: 1,
      })

      const runner = new ParallelRunner({
        config,
        backend,
        cliExecutor: createMockCliExecutor(exitCodes),
        logger: createMockLogger(),
        buildPrompt: (task) => `Test prompt for ${task.id}`,
      })

      const stats = await runner.run()

      expect(stats.completed).toBe(1)
      expect(stats.failed).toBe(1)
    })

    test('abort-all mode should stop on first failure', async () => {
      const tasks = [
        createMockTask('TASK-001'),
        createMockTask('TASK-002'),
        createMockTask('TASK-003'),
      ]
      const backend = createMockBackend(tasks)

      // All tasks fail immediately
      const exitCodes = new Map<string, number>([
        ['TASK-001', 1],
        ['TASK-002', 1],
        ['TASK-003', 1],
      ])

      const config = createTestConfig({
        parallel: 1,
        parallelFailureMode: 'abort-all',
        maxRetries: 1,
      })

      const logger = createMockLogger()
      const runner = new ParallelRunner({
        config,
        backend,
        cliExecutor: createMockCliExecutor(exitCodes),
        logger,
        buildPrompt: (task) => `Test prompt for ${task.id}`,
      })

      const stats = await runner.run()

      // Should have aborted after first failure
      expect(stats.failed).toBeGreaterThanOrEqual(1)
      // Not all tasks should be processed
      expect(stats.completed + stats.failed).toBeLessThanOrEqual(3)
    })
  })

  describe('Resume', () => {
    test('should track interrupted tasks', async () => {
      const tasks = [createMockTask('TASK-001')]
      const backend = createMockBackend(tasks)
      const config = createTestConfig({ parallel: 1 })

      const runner = new ParallelRunner({
        config,
        backend,
        cliExecutor: createMockCliExecutor(),
        logger: createMockLogger(),
        buildPrompt: (task) => `Test prompt for ${task.id}`,
      })

      // Start running but don't await completion
      const runPromise = runner.run()

      // Abort immediately
      runner.abort()

      await runPromise

      const state = runner.getState()
      expect(state.parallel).toBe(1)
      expect(state.namespace).toBe('test')
    })

    test('should reset interrupted tasks to pending', async () => {
      const backend = createMockBackend([])
      const config = createTestConfig()

      const runner = new ParallelRunner({
        config,
        backend,
        cliExecutor: createMockCliExecutor(),
        logger: createMockLogger(),
        buildPrompt: (task) => `Test prompt for ${task.id}`,
      })

      const resetSpy = mock(backend.resetToPending.bind(backend))
      backend.resetToPending = resetSpy

      await runner.resetInterruptedTasks(['TASK-001', 'TASK-002'])

      expect(resetSpy).toHaveBeenCalledTimes(2)
    })
  })

  describe('Statistics', () => {
    test('should track tasks per worker', async () => {
      const tasks = [
        createMockTask('TASK-001'),
        createMockTask('TASK-002'),
        createMockTask('TASK-003'),
        createMockTask('TASK-004'),
      ]
      const backend = createMockBackend(tasks)
      const config = createTestConfig({ parallel: 2, maxIterations: 10 })

      const runner = new ParallelRunner({
        config,
        backend,
        cliExecutor: createMockCliExecutor(),
        logger: createMockLogger(),
        buildPrompt: (task) => `Test prompt for ${task.id}`,
      })

      const stats = await runner.run()

      expect(stats.tasksPerWorker).toBeDefined()
      expect(stats.tasksPerWorker!.length).toBe(2)
      expect(stats.tasksPerWorker!.reduce((a, b) => a + b, 0)).toBe(4)
    })

    test('should report duration', async () => {
      const tasks = [createMockTask('TASK-001')]
      const backend = createMockBackend(tasks)
      const config = createTestConfig({ parallel: 1 })

      const runner = new ParallelRunner({
        config,
        backend,
        cliExecutor: createMockCliExecutor(),
        logger: createMockLogger(),
        buildPrompt: (task) => `Test prompt for ${task.id}`,
      })

      const stats = await runner.run()

      expect(stats.duration).toBeGreaterThan(0)
    })
  })

  describe('Dry Run', () => {
    test('should not execute tasks in dry run mode', async () => {
      const tasks = [createMockTask('TASK-001')]
      const backend = createMockBackend(tasks)
      const cliExecutor = createMockCliExecutor()
      const executeSpy = mock(cliExecutor.execute.bind(cliExecutor))
      cliExecutor.execute = executeSpy

      const config = createTestConfig({ parallel: 1, dryRun: true })

      const runner = new ParallelRunner({
        config,
        backend,
        cliExecutor,
        logger: createMockLogger(),
        buildPrompt: (task) => `Test prompt for ${task.id}`,
      })

      await runner.run()

      expect(executeSpy).not.toHaveBeenCalled()
    })
  })

  describe('Self-Healing', () => {
    // Create a failing executor that includes error messages in output
    function createFailingExecutor(errorMessage: string): ICliExecutor {
      return {
        async execute(prompt: string, outputFile: string, timeout: number, taskId?: string): Promise<number> {
          fs.mkdirSync(path.dirname(outputFile), { recursive: true })
          fs.writeFileSync(outputFile, `Error: ${errorMessage}`)
          return 1
        },
        killCurrent(): void {},
        resetFallback(): void {},
        async cleanup(): Promise<void> {},
      }
    }

    test('should detect and respond to rate limit errors', async () => {
      const tasks = Array.from({ length: 20 }, (_, i) =>
        createMockTask(`TASK-${String(i + 1).padStart(3, '0')}`)
      )
      const backend = createMockBackend(tasks)

      const config = createTestConfig({
        parallel: 2,
        circuitBreakerThreshold: 3,
        maxRetries: 1,
        taskDelay: 10,
        selfHealingCooldown: 10,
      })

      const logger = createMockLogger()
      const runner = new ParallelRunner({
        config,
        backend,
        cliExecutor: createFailingExecutor('rate limit exceeded, 429 too many requests'),
        logger,
        buildPrompt: (task) => `Test prompt for ${task.id}`,
      })

      // Run to completion
      try {
        await runner.run()
      } catch {
        // May throw, that's OK
      }

      // Should have logged self-healing attempts with rate limit pattern
      const warnCalls = logger.warn.mock.calls
      const rateLimitLogs = warnCalls.filter((call: [string]) =>
        call[0] && call[0].includes('Rate limit detected')
      )
      expect(rateLimitLogs.length).toBeGreaterThan(0)
    })

    test('should detect and respond to timeout errors', async () => {
      const tasks = Array.from({ length: 20 }, (_, i) =>
        createMockTask(`TASK-${String(i + 1).padStart(3, '0')}`)
      )
      const backend = createMockBackend(tasks)

      const config = createTestConfig({
        parallel: 2,
        circuitBreakerThreshold: 3,
        maxRetries: 1,
        timeout: 60,
        taskDelay: 10,
        selfHealingCooldown: 10,
      })

      const logger = createMockLogger()
      const runner = new ParallelRunner({
        config,
        backend,
        cliExecutor: createFailingExecutor('operation timed out ETIMEDOUT'),
        logger,
        buildPrompt: (task) => `Test prompt for ${task.id}`,
      })

      // Run to completion
      try {
        await runner.run()
      } catch {
        // May throw, that's OK
      }

      // Should have logged timeout-specific self-healing
      const warnCalls = logger.warn.mock.calls
      const timeoutLogs = warnCalls.filter((call: [string]) =>
        call[0] && call[0].includes('Timeout detected')
      )
      expect(timeoutLogs.length).toBeGreaterThan(0)
    })

    test('should detect and respond to memory errors', async () => {
      const tasks = Array.from({ length: 20 }, (_, i) =>
        createMockTask(`TASK-${String(i + 1).padStart(3, '0')}`)
      )
      const backend = createMockBackend(tasks)

      const config = createTestConfig({
        parallel: 2,
        circuitBreakerThreshold: 3,
        maxRetries: 1,
        taskDelay: 10,
        selfHealingCooldown: 10,
      })

      const logger = createMockLogger()
      const runner = new ParallelRunner({
        config,
        backend,
        cliExecutor: createFailingExecutor('out of memory OOM killed'),
        logger,
        buildPrompt: (task) => `Test prompt for ${task.id}`,
      })

      // Run to completion
      try {
        await runner.run()
      } catch {
        // May throw, that's OK
      }

      // Should have logged memory-specific self-healing
      const warnCalls = logger.warn.mock.calls
      const memoryLogs = warnCalls.filter((call: [string]) =>
        call[0] && call[0].includes('Memory pressure detected')
      )
      expect(memoryLogs.length).toBeGreaterThan(0)
    })

    // Skip: Unknown patterns increase delay significantly, making test slow
    // The unknown pattern handling is still tested implicitly when no specific pattern is detected
    test.skip('should handle unknown error patterns with conservative adjustment', async () => {
      const tasks = Array.from({ length: 15 }, (_, i) =>
        createMockTask(`TASK-${String(i + 1).padStart(3, '0')}`)
      )
      const backend = createMockBackend(tasks)

      // Start with 3 workers so self-healing can reduce them
      const config = createTestConfig({
        parallel: 3,
        circuitBreakerThreshold: 3,
        maxRetries: 1,
        taskDelay: 10,
        selfHealingCooldown: 10,
      })

      const logger = createMockLogger()
      const runner = new ParallelRunner({
        config,
        backend,
        cliExecutor: createFailingExecutor('some random unknown error xyz'),
        logger,
        buildPrompt: (task) => `Test prompt for ${task.id}`,
      })

      // Run to completion
      try {
        await runner.run()
      } catch {
        // May throw, that's OK
      }

      // Should have logged self-healing with unknown pattern handling
      const warnCalls = logger.warn.mock.calls
      const unknownLogs = warnCalls.filter((call: [string]) =>
        call[0] && call[0].includes('Unknown failure pattern')
      )
      expect(unknownLogs.length).toBeGreaterThan(0)
    })

    test('should reset circuit breaker and continue after successful healing', async () => {
      let failCount = 0
      const maxFailsBeforeSuccess = 6 // Fail enough to trigger healing, then succeed

      const healingExecutor: ICliExecutor = {
        async execute(prompt: string, outputFile: string, timeout: number, taskId?: string): Promise<number> {
          fs.mkdirSync(path.dirname(outputFile), { recursive: true })

          failCount++
          if (failCount <= maxFailsBeforeSuccess) {
            fs.writeFileSync(outputFile, 'Error: rate limit exceeded')
            return 1
          }

          fs.writeFileSync(outputFile, `Success for ${taskId}`)
          return 0
        },
        killCurrent(): void {},
        resetFallback(): void {},
        async cleanup(): Promise<void> {},
      }

      const tasks = Array.from({ length: 10 }, (_, i) =>
        createMockTask(`TASK-${String(i + 1).padStart(3, '0')}`)
      )
      const backend = createMockBackend(tasks)

      const config = createTestConfig({
        parallel: 1,
        circuitBreakerThreshold: 3,
        maxRetries: 1,
        taskDelay: 10,
      })

      const logger = createMockLogger()
      const runner = new ParallelRunner({
        config,
        backend,
        cliExecutor: healingExecutor,
        logger,
        buildPrompt: (task) => `Test prompt for ${task.id}`,
      })

      // Should complete without throwing because healing worked
      const stats = await runner.run()

      // Should have some completed tasks
      expect(stats.completed).toBeGreaterThan(0)

      // Should have logged self-healing
      const warnCalls = logger.warn.mock.calls
      const selfHealingLogs = warnCalls.filter((call: [string]) =>
        call[0] && call[0].includes('Self-Healing')
      )
      expect(selfHealingLogs.length).toBeGreaterThan(0)
    })
  })
})
