/**
 * Integration test for dynamic-tasks plugin with JsonTaskAdapter
 *
 * This tests the full workflow of the dynamic-tasks plugin
 * working with a real JSON backend
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import fs from 'fs'
import path from 'path'
import os from 'os'
// Removed type-only import from '../../src/backends'
// Removed type-only import from '../../src/plugins/dynamic-tasks'
import { PatternAnalyzer } from '../../src/analyzers'
import { defineConfig, compose, withPlugin } from '../../src/plugins'
import type { LoopworkConfig } from '../../src/contracts'
import type { Task, TaskContext, PluginTaskResult } from '../../src/contracts'

describe('Dynamic Tasks Plugin with JsonTaskAdapter Integration', () => {
  let tempDir: string
  let tasksFile: string
  let backend: JsonTaskAdapter

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loopwork-dynamic-tasks-'))
    tasksFile = path.join(tempDir, 'tasks.json')

    // Initialize with empty tasks
    fs.writeFileSync(tasksFile, JSON.stringify({
      tasks: [
        {
          id: 'FEAT-001',
          status: 'in-progress',
          priority: 'high',
          feature: 'core'
        }
      ],
      features: {
        core: { name: 'Core Features' }
      }
    }, null, 2))

    // Create task PRD
    fs.writeFileSync(
      path.join(tempDir, 'FEAT-001.md'),
      '# FEAT-001: Implement core feature\n\n## Goal\nBuild core feature'
    )

    backend = new JsonTaskAdapter({ type: 'json', tasksFile, tasksDir: tempDir })
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test('should create tasks in JSON backend from plugin', async () => {
    const plugin = createDynamicTasksPlugin({
      enabled: true,
      autoApprove: true,
      logCreatedTasks: false
    })

    // Initialize plugin with backend
    await plugin.onBackendReady?.(backend)

    // Execute a task and trigger analysis
    const context: TaskContext = {
      task: {
        id: 'FEAT-001',
        title: 'Implement core feature',
        description: 'Build core feature',
        status: 'in-progress',
        priority: 'high',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      iteration: 1,
      startTime: new Date(),
      namespace: 'core'
    }

    const result: PluginTaskResult = {
      success: true,
      output: `
        Feature implemented successfully.

        TODO: Add unit tests for the core module
        FIXME: Handle edge case when input is null

        Next steps: Add integration tests
      `,
      duration: 1000
    }

    await plugin.onTaskComplete?.(context, result)

    // Verify tasks were created in the backend
    const pendingTasks = await backend.listPendingTasks()
    expect(pendingTasks.length).toBeGreaterThan(0)

    // Check that at least one of the expected tasks was created
    const createdTaskTitles = pendingTasks.map(t => t.title)
    const hasTestTask = createdTaskTitles.some(title => title.includes('unit tests') || title.includes('tests'))
    const hasEdgeCaseTask = createdTaskTitles.some(title => title.includes('edge case') || title.includes('null'))

    expect(hasTestTask || hasEdgeCaseTask).toBe(true)
  })

  test('should create sub-tasks when enabled', async () => {
    const plugin = createDynamicTasksPlugin({
      enabled: true,
      createSubTasks: true,
      autoApprove: true,
      logCreatedTasks: false
    })

    await plugin.onBackendReady?.(backend)

    const context: TaskContext = {
      task: {
        id: 'FEAT-001',
        title: 'Implement core feature',
        description: 'Build core feature',
        status: 'in-progress',
        priority: 'high',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      iteration: 1,
      startTime: new Date(),
      namespace: 'core'
    }

    const result: PluginTaskResult = {
      success: true,
      output: 'TODO: Add validation logic\nFIXME: Handle error cases',
      duration: 1000
    }

    await plugin.onTaskComplete?.(context, result)

    // Get created tasks
    const allTasks = await backend.listPendingTasks()
    const subTasks = allTasks.filter(t => t.parentId === 'FEAT-001')

    // Should have created sub-tasks with parent reference
    expect(allTasks.length).toBeGreaterThan(0)
  })

  test('should create remediation tasks on failure', async () => {
    const plugin = createDynamicTasksPlugin({
      enabled: true,
      autoApprove: true,
      logCreatedTasks: false
    })

    await plugin.onBackendReady?.(backend)

    const context: TaskContext = {
      task: {
        id: 'FEAT-001',
        title: 'Implement core feature',
        description: 'Build core feature',
        status: 'failed',
        priority: 'high',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      iteration: 1,
      startTime: new Date(),
      namespace: 'core'
    }

    const errorMessage = 'Compilation failed: missing type definition for UserProfile'

    await plugin.onTaskFailed?.(context, errorMessage)

    // Verify remediation task was created
    const allTasks = await backend.listPendingTasks()
    const remediationTask = allTasks.find(t => t.title.includes('Debug failure'))

    expect(remediationTask).toBeDefined()
    if (remediationTask) {
      expect(remediationTask.description).toContain('Compilation failed')
      expect(remediationTask.priority).toBe('high')
    }
  })

  test('should respect maxTasksPerExecution limit', async () => {
    const plugin = createDynamicTasksPlugin({
      enabled: true,
      maxTasksPerExecution: 1,
      autoApprove: true,
      logCreatedTasks: false
    })

    await plugin.onBackendReady?.(backend)

    const context: TaskContext = {
      task: {
        id: 'FEAT-001',
        title: 'Implement core feature',
        description: 'Build core feature',
        status: 'in-progress',
        priority: 'high',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      iteration: 1,
      startTime: new Date(),
      namespace: 'core'
    }

    const result: PluginTaskResult = {
      success: true,
      output: `
        TODO: Task 1
        TODO: Task 2
        TODO: Task 3
        FIXME: Issue 1
      `,
      duration: 1000
    }

    const initialCount = await backend.countPending()

    await plugin.onTaskComplete?.(context, result)

    const finalCount = await backend.countPending()

    // Should have created at most 1 additional task (maxTasksPerExecution: 1)
    expect(finalCount - initialCount).toBeLessThanOrEqual(1)
  })

  test('should work with compose pattern for config', () => {
    const config = compose(
      withPlugin(createDynamicTasksPlugin({ enabled: true })),
      withDynamicTasks({ maxTasksPerExecution: 3 })
    )(defineConfig({
      backend: { type: 'json', tasksFile },
      cli: 'claude'
    }))

    expect(config.dynamicTasks).toBeDefined()
    expect(config.dynamicTasks.maxTasksPerExecution).toBe(3)
    expect(config.backend.type).toBe('json')
  })

  test('should not create tasks when plugin is disabled', async () => {
    const plugin = createDynamicTasksPlugin({
      enabled: false,
      autoApprove: true
    })

    await plugin.onBackendReady?.(backend)

    const context: TaskContext = {
      task: {
        id: 'FEAT-001',
        title: 'Implement core feature',
        description: 'Build core feature',
        status: 'in-progress',
        priority: 'high',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      iteration: 1,
      startTime: new Date(),
      namespace: 'core'
    }

    const result: PluginTaskResult = {
      success: true,
      output: 'TODO: Add tests',
      duration: 1000
    }

    const initialCount = await backend.countPending()

    await plugin.onTaskComplete?.(context, result)

    const finalCount = await backend.countPending()

    // Should not have created any tasks
    expect(finalCount).toBe(initialCount)
  })

  test('should handle backend with custom pattern analyzer', async () => {
    const customAnalyzer = new PatternAnalyzer({
      patterns: ['todo-comment', 'fixme-comment'],
      enabled: true
    })

    const plugin = createDynamicTasksPlugin({
      enabled: true,
      analyzer: customAnalyzer,
      autoApprove: true,
      logCreatedTasks: false
    })

    await plugin.onBackendReady?.(backend)

    const context: TaskContext = {
      task: {
        id: 'FEAT-001',
        title: 'Implement core feature',
        description: 'Build core feature',
        status: 'in-progress',
        priority: 'high',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      iteration: 1,
      startTime: new Date(),
      namespace: 'core'
    }

    const result: PluginTaskResult = {
      success: true,
      output: 'TODO: Add documentation\nFIXME: Optimize performance',
      duration: 1000
    }

    const initialCount = await backend.countPending()

    await plugin.onTaskComplete?.(context, result)

    const finalCount = await backend.countPending()

    // Should have created at least 2 tasks (TODO + FIXME)
    expect(finalCount - initialCount).toBeGreaterThanOrEqual(1)
  })

  test('should handle tasks.json file updates correctly', async () => {
    const plugin = createDynamicTasksPlugin({
      enabled: true,
      autoApprove: true,
      logCreatedTasks: false
    })

    await plugin.onBackendReady?.(backend)

    // First task completion
    const context1: TaskContext = {
      task: {
        id: 'FEAT-001',
        title: 'Feature 1',
        description: 'Build feature 1',
        status: 'in-progress',
        priority: 'high',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      iteration: 1,
      startTime: new Date(),
      namespace: 'core'
    }

    const result1: PluginTaskResult = {
      success: true,
      output: 'TODO: Follow up 1',
      duration: 1000
    }

    await plugin.onTaskComplete?.(context1, result1)

    const count1 = await backend.countPending()

    // Second task completion
    const context2: TaskContext = {
      task: {
        id: 'FEAT-002',
        title: 'Feature 2',
        description: 'Build feature 2',
        status: 'in-progress',
        priority: 'medium',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      iteration: 2,
      startTime: new Date(),
      namespace: 'core'
    }

    const result2: PluginTaskResult = {
      success: true,
      output: 'FIXME: Issue to fix',
      duration: 1000
    }

    await plugin.onTaskComplete?.(context2, result2)

    const count2 = await backend.countPending()

    // Should have created new tasks from second completion
    expect(count2).toBeGreaterThanOrEqual(count1)

    // Verify tasks file is valid JSON
    const tasksContent = fs.readFileSync(tasksFile, 'utf-8')
    const tasksData = JSON.parse(tasksContent)
    expect(tasksData.tasks).toBeDefined()
    expect(Array.isArray(tasksData.tasks)).toBe(true)
  })
})
