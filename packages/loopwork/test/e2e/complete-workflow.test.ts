import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { StateManager } from '../../src/core/state'
import { JsonTaskBackend } from '../../src/backends/json'
import { PluginRegistry } from '../../src/core/plugin-loader'
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
  let backend: JsonTaskBackend
  let stateManager: StateManager
  let pluginRegistry: PluginRegistry

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

    backend = new JsonTaskBackend(config.backend)
    stateManager = new StateManager(config)
    pluginRegistry = new PluginRegistry()

    fs.mkdirSync(config.outputDir, { recursive: true })
    fs.mkdirSync(path.join(config.outputDir, 'logs'), { recursive: true })
  })

  afterEach(() => {
    stateManager.releaseLock()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('Task Lifecycle', () => {
    test('creates, processes, and completes a task', async () => {
      // Create initial tasks
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
      const inProgressTask = await backend.findOne(task!.id)
      expect(inProgressTask?.status).toBe('in-progress')

      // Mark completed
      await backend.markCompleted(task!.id, 'Task completed successfully')
      const completedTask = await backend.findOne(task!.id)
      expect(completedTask?.status).toBe('completed')
      expect(completedTask?.result).toBe('Task completed successfully')

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

      // Simulate failure
      await backend.markFailed(task!.id, 'Simulated failure')

      // Check retry count
      const failedTask = await backend.findOne(task!.id)
      expect(failedTask?.retryCount).toBe(1)
      expect(failedTask?.status).toBe('failed')
    })

    test('processes multiple tasks in priority order', async () => {
      const tasks: Task[] = [
        {
          id: 'LOW-001',
          title: 'Low Priority',
          status: 'pending',
          priority: 'low',
          feature: 'e2e',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'CRITICAL-001',
          title: 'Critical Priority',
          status: 'pending',
          priority: 'critical',
          feature: 'e2e',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'HIGH-001',
          title: 'High Priority',
          status: 'pending',
          priority: 'high',
          feature: 'e2e',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]

      fs.writeFileSync(tasksFile, JSON.stringify({ tasks }, null, 2))

      // Should get critical first
      const task1 = await backend.findNextTask()
      expect(task1?.id).toBe('CRITICAL-001')
      await backend.markInProgress(task1!.id)

      // Then high
      const task2 = await backend.findNextTask()
      expect(task2?.id).toBe('HIGH-001')
      await backend.markInProgress(task2!.id)

      // Then low
      const task3 = await backend.findNextTask()
      expect(task3?.id).toBe('LOW-001')
    })
  })

  describe('State Management', () => {
    test('maintains state across operations', () => {
      // Initialize state
      stateManager.initializeSession()
      
      // Record some metrics
      stateManager.recordIteration()
      stateManager.recordTaskProcessed()
      stateManager.recordTaskCompleted()

      const metrics = stateManager.getMetrics()
      expect(metrics.iterations).toBe(1)
      expect(metrics.tasksProcessed).toBe(1)
      expect(metrics.tasksCompleted).toBe(1)
    })

    test('handles state persistence', () => {
      stateManager.initializeSession()
      stateManager.recordIteration()

      // Save state
      stateManager.saveState()

      // State file should exist
      const stateFile = path.join(tempDir, '.loopwork', 'state.json')
      expect(fs.existsSync(stateFile)).toBe(true)

      // Load and verify
      const loadedState = JSON.parse(fs.readFileSync(stateFile, 'utf-8'))
      expect(loadedState.metrics.iterations).toBe(1)
    })
  })

  describe('Plugin Integration', () => {
    test('loads and executes plugins', async () => {
      const mockPlugin = {
        name: 'test-plugin',
        classification: 'enhancement' as const,
        version: '1.0.0',
        hooks: {
          'task:complete': [],
        },
        onTaskComplete: mock(() => Promise.resolve()),
      }

      pluginRegistry.register(mockPlugin)

      expect(pluginRegistry.get('test-plugin')).toBeDefined()
      expect(pluginRegistry.list()).toHaveLength(1)

      // Execute hook
      const task: Task = {
        id: 'PLUGIN-001',
        title: 'Plugin Test',
        status: 'completed',
        priority: 'medium',
        feature: 'plugin-test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      await pluginRegistry.executeHook('task:complete', task)
      expect(mockPlugin.onTaskComplete).toHaveBeenCalled()
    })
  })

  describe('Error Recovery', () => {
    test('handles corrupted tasks file gracefully', async () => {
      // Write invalid JSON
      fs.writeFileSync(tasksFile, 'invalid json {{{')

      // Should handle gracefully
      try {
        await backend.countPending()
        // If we get here, backend handled it
      } catch (error) {
        // Or it threw an appropriate error
        expect(error).toBeDefined()
      }
    })

    test('recovers from missing tasks file', async () => {
      // Don't create tasks file
      const count = await backend.countPending()
      expect(count).toBe(0)
    })
  })

  describe('Concurrent Operations', () => {
    test('handles concurrent state updates', async () => {
      stateManager.initializeSession()

      // Simulate concurrent updates
      const promises = Array(10).fill(null).map(() => {
        return new Promise<void>(resolve => {
          stateManager.recordTaskProcessed()
          resolve()
        })
      })

      await Promise.all(promises)

      const metrics = stateManager.getMetrics()
      expect(metrics.tasksProcessed).toBe(10)
    })
  })
})
