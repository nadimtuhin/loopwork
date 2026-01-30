/**
 * Integration tests for parallel execution
 * Tests the full stack: config parsing, JSON backend, and parallel runner
 */

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import fs from 'fs'
import path from 'path'
import { ParallelRunner } from '../../src/core/parallel-runner'
import { JsonTaskAdapter } from '../../src/backends/json'
import type { ICliExecutor } from '../../src/contracts/executor'
import type { Config } from '../../src/core/config'

// Test directory management
let testDir: string

function createTestDir(): string {
  const dir = `/tmp/loopwork-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`
  fs.mkdirSync(dir, { recursive: true })
  fs.mkdirSync(path.join(dir, '.loopwork'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'logs'), { recursive: true })
  return dir
}

function cleanupTestDir(dir: string): void {
  if (dir && fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

// Create tasks.json with PRD files
function setupTestTasks(dir: string, tasks: Array<{ id: string; status?: string; priority?: string }>): void {
  const tasksDir = path.join(dir, '.specs', 'tasks')
  fs.mkdirSync(tasksDir, { recursive: true })

  // Create tasks.json
  const tasksJson = {
    tasks: tasks.map(t => ({
      id: t.id,
      status: t.status || 'pending',
      priority: t.priority || 'medium',
    })),
  }
  fs.writeFileSync(path.join(tasksDir, 'tasks.json'), JSON.stringify(tasksJson, null, 2))

  // Create PRD files
  for (const task of tasks) {
    const prdContent = `# ${task.id}

## Goal
Test task ${task.id}

## Requirements
- Requirement 1
- Requirement 2
`
    fs.writeFileSync(path.join(tasksDir, `${task.id}.md`), prdContent)
  }
}

// Mock CLI executor that tracks executions
function createTestCliExecutor(options: {
  exitCodes?: Map<string, number>
  delayMs?: number
  errorMessage?: string  // Custom error message for failing tasks
} = {}): ICliExecutor & { executions: string[] } {
  const executions: string[] = []

  return {
    executions,
    async execute(prompt: string, outputFile: string, timeout: number, taskId?: string): Promise<number> {
      executions.push(taskId || 'unknown')

      // Simulate some work
      if (options.delayMs) {
        await new Promise(r => setTimeout(r, options.delayMs))
      }

      const exitCode = options.exitCodes?.get(taskId || '') ?? 0

      // Write mock output - include error message for failures to help self-healing detect patterns
      fs.mkdirSync(path.dirname(outputFile), { recursive: true })
      if (exitCode !== 0) {
        const errorMsg = options.errorMessage || 'Error: rate limit exceeded 429'
        fs.writeFileSync(outputFile, `${errorMsg}\nTask ${taskId} failed\n`)
      } else {
        fs.writeFileSync(outputFile, `Executed ${taskId} successfully\n`)
      }

      return exitCode
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
  setLogFile: mock(() => {}),
})

// Create test config
function createTestConfig(dir: string, overrides: Partial<Config> = {}): Config {
  return {
    projectRoot: dir,
    outputDir: dir,
    sessionId: `test-${Date.now()}`,
    debug: false,
    resume: false,
    backend: {
      type: 'json',
      tasksFile: path.join(dir, '.specs', 'tasks', 'tasks.json'),
      tasksDir: path.join(dir, '.specs', 'tasks'),
    },
    namespace: 'test',
    parallel: 2,
    parallelFailureMode: 'continue',
    maxIterations: 20,
    timeout: 60,
    circuitBreakerThreshold: 5,
    maxRetries: 2,
    taskDelay: 10,
    ...overrides,
  } as Config
}

describe('Parallel Execution Integration', () => {
  beforeEach(() => {
    testDir = createTestDir()
  })

  afterEach(() => {
    cleanupTestDir(testDir)
  })

  describe('Full Stack Parallel Execution', () => {
    test('should execute multiple tasks in parallel with JSON backend', async () => {
      // Setup
      setupTestTasks(testDir, [
        { id: 'TASK-001' },
        { id: 'TASK-002' },
        { id: 'TASK-003' },
        { id: 'TASK-004' },
      ])

      const config = createTestConfig(testDir, { parallel: 2 })
      const backend = new JsonTaskAdapter(config.backend)
      const cliExecutor = createTestCliExecutor()

      // Execute
      const runner = new ParallelRunner({
        config,
        backend,
        cliExecutor,
        logger: createMockLogger(),
        buildPrompt: (task) => `Execute ${task.id}: ${task.description}`,
      })

      const stats = await runner.run()

      // Verify
      expect(stats.completed).toBe(4)
      expect(stats.failed).toBe(0)
      expect(stats.workers).toBe(2)
      expect(cliExecutor.executions.length).toBe(4)

      // All tasks should be completed in backend
      const pending = await backend.countPending()
      expect(pending).toBe(0)
    })

    test('should handle concurrent task claiming without duplicates', async () => {
      // Setup many tasks
      const tasks = Array.from({ length: 10 }, (_, i) => ({
        id: `TASK-${String(i + 1).padStart(3, '0')}`,
      }))
      setupTestTasks(testDir, tasks)

      const config = createTestConfig(testDir, { parallel: 5, maxIterations: 20 })
      const backend = new JsonTaskAdapter(config.backend)
      const cliExecutor = createTestCliExecutor({ delayMs: 5 })

      // Execute with high parallelism
      const runner = new ParallelRunner({
        config,
        backend,
        cliExecutor,
        logger: createMockLogger(),
        buildPrompt: (task) => `Execute ${task.id}`,
      })

      const stats = await runner.run()

      // Verify no duplicate executions
      const uniqueExecutions = new Set(cliExecutor.executions)
      expect(uniqueExecutions.size).toBe(cliExecutor.executions.length)
      expect(stats.completed).toBe(10)
    })

    test('should respect feature filter in parallel mode', async () => {
      // Setup tasks with different features
      setupTestTasks(testDir, [
        { id: 'AUTH-001' },
        { id: 'AUTH-002' },
        { id: 'UI-001' },
        { id: 'UI-002' },
      ])

      // Manually update tasks.json to add features
      const tasksFile = path.join(testDir, '.specs', 'tasks', 'tasks.json')
      const tasksData = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'))
      tasksData.tasks[0].feature = 'auth'
      tasksData.tasks[1].feature = 'auth'
      tasksData.tasks[2].feature = 'ui'
      tasksData.tasks[3].feature = 'ui'
      fs.writeFileSync(tasksFile, JSON.stringify(tasksData, null, 2))

      const config = createTestConfig(testDir, { parallel: 2, feature: 'auth' })
      const backend = new JsonTaskAdapter(config.backend)
      const cliExecutor = createTestCliExecutor()

      const runner = new ParallelRunner({
        config,
        backend,
        cliExecutor,
        logger: createMockLogger(),
        buildPrompt: (task) => `Execute ${task.id}`,
      })

      const stats = await runner.run({ feature: 'auth' })

      // Only AUTH tasks should be executed
      expect(stats.completed).toBe(2)
      expect(cliExecutor.executions).toContain('AUTH-001')
      expect(cliExecutor.executions).toContain('AUTH-002')
      expect(cliExecutor.executions).not.toContain('UI-001')
    })
  })

  describe('Failure Handling', () => {
    test('should handle mixed success and failure in parallel', async () => {
      setupTestTasks(testDir, [
        { id: 'TASK-001' },
        { id: 'TASK-002' },
        { id: 'TASK-003' },
      ])

      const exitCodes = new Map([
        ['TASK-001', 0],
        ['TASK-002', 1], // Fails
        ['TASK-003', 0],
      ])

      const config = createTestConfig(testDir, { parallel: 2, maxRetries: 1 })
      const backend = new JsonTaskAdapter(config.backend)
      const cliExecutor = createTestCliExecutor({ exitCodes })

      const runner = new ParallelRunner({
        config,
        backend,
        cliExecutor,
        logger: createMockLogger(),
        buildPrompt: (task) => `Execute ${task.id}`,
      })

      const stats = await runner.run()

      expect(stats.completed).toBe(2)
      expect(stats.failed).toBe(1)

      // Verify task statuses in backend
      const task1 = await backend.getTask('TASK-001')
      const task2 = await backend.getTask('TASK-002')
      const task3 = await backend.getTask('TASK-003')

      expect(task1?.status).toBe('completed')
      expect(task2?.status).toBe('failed')
      expect(task3?.status).toBe('completed')
    })

    test('should trigger circuit breaker and self-healing on consecutive failures', async () => {
      // Create enough tasks to trigger circuit breaker and self-healing
      const tasks = Array.from({ length: 15 }, (_, i) => ({
        id: `TASK-${String(i + 1).padStart(3, '0')}`,
      }))
      setupTestTasks(testDir, tasks)

      // All tasks fail
      const exitCodes = new Map<string, number>()
      tasks.forEach(t => exitCodes.set(t.id, 1))

      const config = createTestConfig(testDir, {
        parallel: 1,
        circuitBreakerThreshold: 3,
        maxRetries: 1,
        selfHealingCooldown: 10, // Minimal cooldown for tests
      })
      const backend = new JsonTaskAdapter(config.backend)
      const cliExecutor = createTestCliExecutor({ exitCodes })
      const logger = createMockLogger()

      const runner = new ParallelRunner({
        config,
        backend,
        cliExecutor,
        logger,
        buildPrompt: (task) => `Execute ${task.id}`,
      })

      // Run to completion (may throw or complete when tasks exhausted)
      try {
        await runner.run()
      } catch (error) {
        // Expected - circuit breaker may throw after exhausting self-healing
        expect(String(error)).toMatch(/circuit breaker/i)
      }

      // Verify that circuit breaker was triggered and self-healing was attempted
      const stats = runner.getStats()
      expect(stats.failed).toBeGreaterThan(0)

      // Verify self-healing was logged
      const warnCalls = logger.warn.mock.calls
      const selfHealingLogs = warnCalls.filter((call: [string]) =>
        call[0] && call[0].includes('Self-Healing')
      )
      expect(selfHealingLogs.length).toBeGreaterThan(0)
    })
  })

  describe('State Management', () => {
    test('should generate worker-specific log files', async () => {
      setupTestTasks(testDir, [
        { id: 'TASK-001' },
        { id: 'TASK-002' },
      ])

      const config = createTestConfig(testDir, { parallel: 2 })
      const backend = new JsonTaskAdapter(config.backend)
      const cliExecutor = createTestCliExecutor()

      const runner = new ParallelRunner({
        config,
        backend,
        cliExecutor,
        logger: createMockLogger(),
        buildPrompt: (task) => `Execute ${task.id}`,
      })

      await runner.run()

      // Check for log files (iteration 1, workers 0 and 1)
      const logsDir = path.join(testDir, 'logs')
      const logFiles = fs.readdirSync(logsDir)

      // Should have output and prompt files for each worker
      const hasWorkerLogs = logFiles.some(f =>
        f.includes('worker-0') || f.includes('worker-1')
      )
      expect(hasWorkerLogs).toBe(true)
    })

    test('should track interrupted tasks for resume', async () => {
      setupTestTasks(testDir, [
        { id: 'TASK-001' },
        { id: 'TASK-002' },
      ])

      const config = createTestConfig(testDir, { parallel: 1 })
      const backend = new JsonTaskAdapter(config.backend)
      const cliExecutor = createTestCliExecutor()

      const runner = new ParallelRunner({
        config,
        backend,
        cliExecutor,
        logger: createMockLogger(),
        buildPrompt: (task) => `Execute ${task.id}`,
      })

      // Run and get state
      await runner.run()
      const state = runner.getState()

      expect(state.parallel).toBe(1)
      expect(state.namespace).toBe('test')
      expect(state.sessionId).toContain('test-')
    })
  })

  describe('claimTask Atomicity', () => {
    test('should atomically claim tasks preventing double-processing', async () => {
      // This test verifies the claimTask method works correctly under the lock
      setupTestTasks(testDir, [{ id: 'TASK-001' }])

      const config = createTestConfig(testDir)
      const backend = new JsonTaskAdapter(config.backend)

      // Claim the task
      const claimed1 = await backend.claimTask()
      expect(claimed1).not.toBeNull()
      expect(claimed1?.id).toBe('TASK-001')

      // Second claim should get null (no more pending tasks)
      const claimed2 = await backend.claimTask()
      expect(claimed2).toBeNull()

      // Verify task is now in-progress
      const task = await backend.getTask('TASK-001')
      expect(task?.status).toBe('in-progress')
    })
  })

  describe('Task Dependencies (File Conflict Prevention)', () => {
    test('should skip blocked tasks and only run unblocked ones in parallel', async () => {
      // Setup: AUTH-002 depends on AUTH-001, UI-001 is independent
      setupTestTasks(testDir, [
        { id: 'AUTH-001' },
        { id: 'AUTH-002' },
        { id: 'UI-001' },
      ])

      // Add dependency: AUTH-002 depends on AUTH-001
      const tasksFile = path.join(testDir, '.specs', 'tasks', 'tasks.json')
      const tasksData = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'))
      tasksData.tasks[1].dependsOn = ['AUTH-001']
      fs.writeFileSync(tasksFile, JSON.stringify(tasksData, null, 2))

      const config = createTestConfig(testDir, { parallel: 2, maxIterations: 10 })
      const backend = new JsonTaskAdapter(config.backend)
      const cliExecutor = createTestCliExecutor()

      const runner = new ParallelRunner({
        config,
        backend,
        cliExecutor,
        logger: createMockLogger(),
        buildPrompt: (task) => `Execute ${task.id}`,
      })

      const stats = await runner.run()

      // All 3 tasks should complete
      expect(stats.completed).toBe(3)

      // AUTH-002 should NOT run before AUTH-001
      const auth001Index = cliExecutor.executions.indexOf('AUTH-001')
      const auth002Index = cliExecutor.executions.indexOf('AUTH-002')
      expect(auth001Index).toBeLessThan(auth002Index)
    })

    test('should handle chain of dependencies correctly', async () => {
      // Setup: A -> B -> C (C depends on B, B depends on A)
      setupTestTasks(testDir, [
        { id: 'CHAIN-A' },
        { id: 'CHAIN-B' },
        { id: 'CHAIN-C' },
      ])

      const tasksFile = path.join(testDir, '.specs', 'tasks', 'tasks.json')
      const tasksData = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'))
      tasksData.tasks[1].dependsOn = ['CHAIN-A']  // B depends on A
      tasksData.tasks[2].dependsOn = ['CHAIN-B']  // C depends on B
      fs.writeFileSync(tasksFile, JSON.stringify(tasksData, null, 2))

      const config = createTestConfig(testDir, { parallel: 3, maxIterations: 10 })
      const backend = new JsonTaskAdapter(config.backend)
      const cliExecutor = createTestCliExecutor()

      const runner = new ParallelRunner({
        config,
        backend,
        cliExecutor,
        logger: createMockLogger(),
        buildPrompt: (task) => `Execute ${task.id}`,
      })

      const stats = await runner.run()

      expect(stats.completed).toBe(3)

      // Verify execution order: A before B before C
      const aIndex = cliExecutor.executions.indexOf('CHAIN-A')
      const bIndex = cliExecutor.executions.indexOf('CHAIN-B')
      const cIndex = cliExecutor.executions.indexOf('CHAIN-C')

      expect(aIndex).toBeLessThan(bIndex)
      expect(bIndex).toBeLessThan(cIndex)
    })

    test('should run independent tasks in parallel while respecting dependencies', async () => {
      // Setup: Independent tasks run in parallel, dependent tasks wait
      // AUTH-001, AUTH-002 (depends on AUTH-001)
      // UI-001, UI-002 (independent of AUTH)
      setupTestTasks(testDir, [
        { id: 'AUTH-001' },
        { id: 'AUTH-002' },
        { id: 'UI-001' },
        { id: 'UI-002' },
      ])

      const tasksFile = path.join(testDir, '.specs', 'tasks', 'tasks.json')
      const tasksData = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'))
      tasksData.tasks[1].dependsOn = ['AUTH-001']  // AUTH-002 depends on AUTH-001
      fs.writeFileSync(tasksFile, JSON.stringify(tasksData, null, 2))

      const config = createTestConfig(testDir, { parallel: 2, maxIterations: 10 })
      const backend = new JsonTaskAdapter(config.backend)
      const cliExecutor = createTestCliExecutor({ delayMs: 10 })

      const runner = new ParallelRunner({
        config,
        backend,
        cliExecutor,
        logger: createMockLogger(),
        buildPrompt: (task) => `Execute ${task.id}`,
      })

      const stats = await runner.run()

      expect(stats.completed).toBe(4)

      // AUTH-002 must come after AUTH-001
      const auth001Index = cliExecutor.executions.indexOf('AUTH-001')
      const auth002Index = cliExecutor.executions.indexOf('AUTH-002')
      expect(auth001Index).toBeLessThan(auth002Index)

      // UI tasks can run in any order (independent)
      expect(cliExecutor.executions).toContain('UI-001')
      expect(cliExecutor.executions).toContain('UI-002')
    })
  })
})
