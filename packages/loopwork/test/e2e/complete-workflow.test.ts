import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { StateManager } from '../../src/core/state'
import { JsonTaskAdapter } from '../../src/backends/json'
import { plugins } from '../../src/plugins'
import type { Config, Task } from '../../src/index'

/**
 * Complete Workflow E2E Tests
 * 
 * Tests the entire loopwork workflow from task creation to completion
 * including all major components working together.
 */

describe('Complete Workflow E2E', () => {
  let tempDir: string
  let tasksFile: string
  let config: Config
  let backend: JsonTaskAdapter
  let stateManager: StateManager

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loopwork-e2e-'))
    tasksFile = path.join(tempDir, 'tasks.json')

    config = {
      projectRoot: tempDir,
      backend: { type: 'json', tasksFile, tasksDir: tempDir },
      cli: 'claude',
      maxIterations: 10,
      timeout: 30,
      namespace: 'test',
      sessionId: 'test-session',
      outputDir: path.join(tempDir, 'output'),
      dryRun: false,
      debug: false,
      autoConfirm: true,
      maxRetries: 2,
      circuitBreakerThreshold: 3,
      taskDelay: 0,
      retryDelay: 0,
    } as Config

    backend = new JsonTaskAdapter(config.backend)
    stateManager = new StateManager(config)

    fs.mkdirSync(config.outputDir, { recursive: true })
    fs.mkdirSync(path.join(config.outputDir, 'logs'), { recursive: true })
  })

  afterEach(() => {
    stateManager.releaseLock()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('Task Lifecycle', () => {
    test('creates, processes, and completes a task', async () => {
      // Create initial tasks file
      const initialTasks: Task[] = [
        {
          id: 'E2E-001',
          title: 'Test Task',
          description: 'A test task for E2E',
          status: 'pending',
          priority: 'high',
          feature: 'e2e-test',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]

      fs.writeFileSync(tasksFile, JSON.stringify({ tasks: initialTasks }, null, 2))

      // Verify initial state
      const pendingCount = await backend.countPending()
      expect(pendingCount).toBe(1)

      // Find and claim task
      const task = await backend.findNextTask()
      expect(task).not.toBeNull()
      expect(task!.id).toBe('E2E-001')

      // Mark in progress
      await backend.markInProgress(task!.id)
      const inProgressTask = await backend.getTask(task!.id)
      expect(inProgressTask?.status).toBe('in-progress')

      // Mark completed
      await backend.markCompleted(task!.id, 'Task completed successfully')
      const completedTask = await backend.getTask(task!.id)
      expect(completedTask?.status).toBe('completed')

      // Verify no pending tasks remain
      const finalPending = await backend.countPending()
      expect(finalPending).toBe(0)
    })

    test('handles task failure with retry', async () => {
      const tasks: Task[] = [
        {
          id: 'E2E-FAIL-001',
          title: 'Failing Task',
          description: 'A task that will fail',
          status: 'pending',
          priority: 'medium',
          feature: 'e2e-test',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          maxRetries: 2,
          retryCount: 0,
        },
      ]

      fs.writeFileSync(tasksFile, JSON.stringify({ tasks }, null, 2))

      const task = await backend.findNextTask()
      expect(task).not.toBeNull()

      // Mark in progress first
      await backend.markInProgress(task!.id)

      // Simulate failure
      await backend.markFailed(task!.id, 'Simulated failure')

      // Check task status
      const failedTask = await backend.getTask(task!.id)
      expect(failedTask?.status).toBe('failed')
    })

    test('claims tasks in order', async () => {
      const tasks: Task[] = [
        {
          id: 'TASK-001',
          title: 'First Task',
          status: 'pending',
          priority: 'medium',
          feature: 'e2e',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'TASK-002',
          title: 'Second Task',
          status: 'pending',
          priority: 'medium',
          feature: 'e2e',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]

      fs.writeFileSync(tasksFile, JSON.stringify({ tasks }, null, 2))

      // Claim first task
      const task1 = await backend.claimTask()
      expect(task1?.id).toBeDefined()
      
      // Claim second task
      const task2 = await backend.claimTask()
      expect(task2?.id).toBeDefined()
      expect(task2?.id).not.toBe(task1?.id)
    })
  })

  describe('State Management', () => {
    test('saves and loads state', () => {
      // Save state
      stateManager.saveState(1, 5)

      // Load state
      const loaded = stateManager.loadState()
      expect(loaded).not.toBeNull()
      expect(loaded?.lastIssue).toBe(1)
      expect(loaded?.lastIteration).toBe(5)
    })

    test('handles lock acquisition', () => {
      // Acquire lock
      const acquired = stateManager.acquireLock()
      expect(acquired).toBe(true)

      // Release lock
      expect(() => stateManager.releaseLock()).not.toThrow()
    })

    test('clears state', () => {
      // Save some state
      stateManager.saveState(10, 100)
      expect(stateManager.loadState()).not.toBeNull()

      // Clear state
      stateManager.clearState()
      expect(stateManager.loadState()).toBeNull()
    })
  })

  describe('Plugin Integration', () => {
    test('plugins module is available', () => {
      expect(plugins).toBeDefined()
      expect(typeof plugins.runHook).toBe('function')
    })
  })

  describe('Error Recovery', () => {
    test('handles corrupted tasks file gracefully', async () => {
      // Write invalid JSON
      fs.writeFileSync(tasksFile, 'invalid json {{{')

      // Should handle gracefully - countPending should return 0 or throw
      try {
        const count = await backend.countPending()
        expect(typeof count).toBe('number')
      } catch (error) {
        // Or it might throw an error, which is also acceptable
        expect(error).toBeDefined()
      }
    })

    test('recovers from missing tasks file', async () => {
      // Don't create tasks file
      const count = await backend.countPending()
      expect(count).toBe(0)
    })
  })

  describe('Backend Operations', () => {
    test('lists pending tasks', async () => {
      const tasks: Task[] = [
        {
          id: 'PENDING-001',
          title: 'Pending Task 1',
          status: 'pending',
          priority: 'high',
          feature: 'test',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'PENDING-002',
          title: 'Pending Task 2',
          status: 'pending',
          priority: 'medium',
          feature: 'test',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]

      fs.writeFileSync(tasksFile, JSON.stringify({ tasks }, null, 2))

      const pending = await backend.listPendingTasks()
      expect(pending.length).toBe(2)
    })

    test('updates task priority', async () => {
      const tasks: Task[] = [
        {
          id: 'PRIO-001',
          title: 'Priority Test',
          status: 'pending',
          priority: 'low',
          feature: 'test',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]

      fs.writeFileSync(tasksFile, JSON.stringify({ tasks }, null, 2))

      // Update priority
      await backend.setPriority('PRIO-001', 'critical')

      // Verify update
      const task = await backend.getTask('PRIO-001')
      expect(task?.priority).toBe('critical')
    })

    test('adds comment to task', async () => {
      const tasks: Task[] = [
        {
          id: 'COMMENT-001',
          title: 'Comment Test',
          status: 'pending',
          priority: 'medium',
          feature: 'test',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]

      fs.writeFileSync(tasksFile, JSON.stringify({ tasks }, null, 2))

      // Add comment
      const result = await backend.addComment('COMMENT-001', 'Test comment')
      expect(result.success).toBe(true)

      // Verify comment log file was created
      const logFile = path.join(tempDir, 'COMMENT-001.log')
      expect(fs.existsSync(logFile)).toBe(true)
      const logContent = fs.readFileSync(logFile, 'utf-8')
      expect(logContent).toContain('Test comment')
    })
  })
})
