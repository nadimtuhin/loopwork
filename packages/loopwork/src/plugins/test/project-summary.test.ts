import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import { createProjectSummaryPlugin, ProjectSummaryManager } from '../project-summary'
import type { Task, TaskBackend } from '../../contracts'
import * as fs from 'fs/promises'
import * as path from 'path'

describe('Project Summary Plugin', () => {
  const testFile = '.loopwork/test-summary.md'

  const mockTask: Task = {
    id: 'TASK-001',
    title: 'Test Task',
    description: 'Test Description',
    status: 'pending',
    priority: 'high',
    feature: 'test',
  }

  const mockBackend = {
    listPendingTasks: mock(async () => [mockTask]),
  } as unknown as TaskBackend

  beforeEach(async () => {
    try {
      await fs.unlink(testFile)
    } catch {}
  })

  afterEach(async () => {
    try {
      await fs.unlink(testFile)
    } catch {}
  })

  test('should generate basic summary when no API key provided', async () => {
    const plugin = createProjectSummaryPlugin({
      enabled: true,
      outputFile: testFile,
      openaiApiKey: '',
      claudeApiKey: '',
    })

    if (plugin.onBackendReady) {
      await plugin.onBackendReady(mockBackend)
    }

    if (plugin.onTaskComplete) {
      await plugin.onTaskComplete(
        { task: mockTask } as any,
        { success: true, duration: 100 } as any
      )
    }

    if (plugin.onLoopEnd) {
      await plugin.onLoopEnd({ completed: 1, failed: 0, duration: 100 })
    }

    let exists = false
    try {
      await fs.access(testFile)
      exists = true
    } catch {}
    expect(exists).toBe(true)

    const content = await fs.readFile(testFile, 'utf-8')
    expect(content).toContain('Project Summary')
    expect(content).toContain('Completed (1)')
    expect(content).toContain('Test Task')
  })

  test('should track failed tasks', async () => {
    const plugin = createProjectSummaryPlugin({
      enabled: true,
      outputFile: testFile,
      openaiApiKey: '',
      claudeApiKey: '',
    })

    if (plugin.onBackendReady) {
      await plugin.onBackendReady(mockBackend)
    }

    if (plugin.onTaskFailed) {
      await plugin.onTaskFailed(
        { task: mockTask } as any,
        'Some error occurred'
      )
    }

    if (plugin.onLoopEnd) {
      await plugin.onLoopEnd({ completed: 0, failed: 1, duration: 100 })
    }

    const content = await fs.readFile(testFile, 'utf-8')
    expect(content).toContain('Failed (1)')
    expect(content).toContain('Some error occurred')
  })

  test('should not generate if disabled', async () => {
    const plugin = createProjectSummaryPlugin({
      enabled: false,
      outputFile: testFile,
    })

    if (plugin.onBackendReady) {
      await plugin.onBackendReady(mockBackend)
    }

    if (plugin.onLoopEnd) {
      await plugin.onLoopEnd({ completed: 0, failed: 0, duration: 0 })
    }

    let exists = false
    try {
      await fs.access(testFile)
      exists = true
    } catch {}
    expect(exists).toBe(false)
  })
})
