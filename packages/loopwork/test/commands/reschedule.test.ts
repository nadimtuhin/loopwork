import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  createBackend,
  GitHubTaskAdapter,
  JsonTaskAdapter,
  type TaskBackend,
  type Task,
  type BackendConfig,
} from '../../src/backends'
import * as utils from '../../src/core/utils'
import { LoopworkError } from '../../src/core/errors'
import { getBackendAndConfig } from '../../src/commands/shared'
import type { RescheduleOptions } from '../../src/commands/reschedule'
import { reschedule } from '../../src/commands/reschedule'

describe('Reschedule Functionality', () => {
  let tempTasksFile: string
  let tempDir: string
  let adapter: JsonTaskAdapter
  let githubAdapter: GitHubTaskAdapter

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reschedule-test-'))
    tempTasksFile = path.join(tempDir, 'tasks.json')

    adapter = new JsonTaskAdapter({
      type: 'json',
      tasksFile: tempTasksFile,
      tasksDir: tempDir,
    })

    githubAdapter = new GitHubTaskAdapter({ type: 'github', repo: 'test/repo' })
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('JsonTaskAdapter.rescheduleCompleted', () => {
    beforeEach(() => {
      spyOn(utils.logger, 'info').mockImplementation(() => {})
      spyOn(utils.logger, 'success').mockImplementation(() => {})
    })

    test('creates tasks file if it does not exist', async () => {
      const tasksData = {
        tasks: [{ id: 'TASK-001', status: 'pending' }],
      }
      fs.writeFileSync(tempTasksFile, JSON.stringify(tasksData, null, 2))
    })

    test('returns error when task does not exist', async () => {
      const result = await adapter.rescheduleCompleted('NONEXISTENT')

      expect(result.success).toBe(false)
      expect(result.error).toContain('NONEXISTENT not found')
    })

    test('returns error when tasks file not found', async () => {
      const result = await adapter.rescheduleCompleted('TASK-001')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Tasks file not found')
    })

    test('clears completedAt timestamp when rescheduling', async () => {
      const tasksData = {
        tasks: [
          {
            id: 'TASK-004',
            status: 'completed',
            priority: 'low',
            feature: 'other',
            completedAt: '2025-02-01T10:00:00Z',
            timestamps: {
              completedAt: '2025-02-01T10:00:00Z',
            },
          },
        ],
      }
      fs.writeFileSync(tempTasksFile, JSON.stringify(tasksData, null, 2))

      await adapter.rescheduleCompleted('TASK-004')

      const data = JSON.parse(fs.readFileSync(tempTasksFile, 'utf-8'))
      expect(data.tasks[0].completedAt).toBeUndefined()
      expect(data.tasks[0].timestamps?.completedAt).toBeUndefined()
    })

    test('creates event with proper metadata', async () => {
      const tasksData = {
        tasks: [
          {
            id: 'TASK-005',
            status: 'completed',
            priority: 'high',
            feature: 'auth',
            completedAt: '2025-02-01T10:00:00Z',
          },
        ],
      }
      fs.writeFileSync(tempTasksFile, JSON.stringify(tasksData, null, 2))

      await adapter.rescheduleCompleted('TASK-005')

      const data = JSON.parse(fs.readFileSync(tempTasksFile, 'utf-8'))
      const event = data.tasks[0].events[0]
      expect(event.metadata.oldStatus).toBe('completed')
      expect(event.metadata.newStatus).toBe('pending')
      expect(event.metadata.scheduledFor).toBeNull()
    })
  })

  describe('GithubTaskAdapter.rescheduleCompleted', () => {
    test('reschedules completed GitHub issue to pending', async () => {
      const result = await githubAdapter.rescheduleCompleted('123')

      expect(result.success).toBe(true)
    })

    test('returns error for invalid task ID format', async () => {
      const result = await githubAdapter.rescheduleCompleted('invalid-id')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid task ID')
    })
  })

  describe('findNextTask filtering by scheduledFor', () => {
    beforeEach(() => {
      spyOn(utils.logger, 'info').mockImplementation(() => {})
      spyOn(utils.logger, 'success').mockImplementation(() => {})
    })

    test('excludes future-scheduled tasks', async () => {
      const tasksData = {
        tasks: [
          {
            id: 'PAST-TASK',
            status: 'pending',
            scheduledFor: '2025-01-01T10:00:00Z',
          },
          {
            id: 'CURRENT-TASK',
            status: 'pending',
          },
          {
            id: 'FUTURE-TASK',
            status: 'pending',
            scheduledFor: '2025-12-31T23:59:59Z',
          },
        ],
      }
      fs.writeFileSync(tempTasksFile, JSON.stringify(tasksData, null, 2))

      const task = await adapter.findNextTask()

      expect(task).not.toBeNull()
      expect(task.id).toBe('PAST-TASK')
    })

    test('includes tasks without scheduledFor', async () => {
      const tasksData = {
        tasks: [
          {
            id: 'TASK-NO-DATE',
            status: 'pending',
          },
          {
            id: 'TASK-WITH-DATE',
            status: 'pending',
            scheduledFor: '2025-01-01T10:00:00Z',
          },
        ],
      }
      fs.writeFileSync(tempTasksFile, JSON.stringify(tasksData, null, 2))

      const task = await adapter.findNextTask()

      expect(task).not.toBeNull()
      expect(task.id).toBe('TASK-NO-DATE')
    })

    test('excludes all future-scheduled tasks', async () => {
      const tasksData = {
        tasks: [
          {
            id: 'FUTURE-1',
            status: 'pending',
            scheduledFor: '2025-12-31T23:59:59Z',
          },
          {
            id: 'FUTURE-2',
            status: 'pending',
            scheduledFor: '2025-12-30T23:59:59Z',
          },
          {
            id: 'CURRENT',
            status: 'pending',
          },
        ],
      }
      fs.writeFileSync(tempTasksFile, JSON.stringify(tasksData, null, 2))

      const task = await adapter.findNextTask()

      expect(task).not.toBeNull()
      expect(task.id).toBe('CURRENT')
    })

    test('returns null when no pending tasks available', async () => {
      const tasksData = {
        tasks: [
          {
            id: 'COMPLETED',
            status: 'completed',
          },
          {
            id: 'IN_PROGRESS',
            status: 'in-progress',
          },
        ],
      }
      fs.writeFileSync(tempTasksFile, JSON.stringify(tasksData, null, 2))

      const task = await adapter.findNextTask()

      expect(task).toBeNull()
    })
  })

  describe('Reschedule CLI command', () => {
    const createTestDeps = (overrides = {}) => ({
      getBackendAndConfig,
      logger: utils.logger,
      LoopworkErrorClass: LoopworkError,
      ...overrides,
    })

    beforeEach(() => {
      spyOn(utils.logger, 'info').mockImplementation(() => {})
      spyOn(utils.logger, 'success').mockImplementation(() => {})
    })

    test('validates task ID is required', async () => {
      await expect(reschedule('', {}, createTestDeps())).rejects.toThrow(LoopworkError)
    })

    test('validates datetime format for --for option', async () => {
      const result = await reschedule('TASK-001', { for: 'invalid-date' }, createTestDeps())
      expect(result).toBeInstanceOf(LoopworkError)
    })

    test('accepts valid ISO 8601 datetime format', async () => {
      const result = await reschedule('TASK-001', { for: '2025-02-01T12:00:00Z' }, createTestDeps())
      expect(result).not.toBeInstanceOf(LoopworkError)
    })

    test('returns error when backend reschedule fails', async () => {
      const mockBackend = {
        name: 'json',
        findNextTask: async () => null,
        getTask: async () => null,
        listPendingTasks: async () => [],
        countPending: async () => 0,
        markInProgress: async () => ({ success: false, error: 'Test error' }),
        markCompleted: async () => ({ success: false, error: 'Test error' }),
        markFailed: async () => ({ success: false, error: 'Test error' }),
        resetToPending: async () => ({ success: false, error: 'Test error' }),
        getSubTasks: async () => [],
        getDependencies: async () => [],
        areDependenciesMet: async () => true,
        setPriority: async () => ({ success: false, error: 'Test error' }),
        rescheduleCompleted: async () => ({ success: false, error: 'Task not found' }),
      }

      const result = await reschedule('TASK-001', {}, createTestDeps({
        getBackendAndConfig: async () => ({ backend: mockBackend, config: { backend: { type: 'json' } } }),
      }))
      expect(result).toBeInstanceOf(LoopworkError)
    })

    test('logs success message with immediate reschedule', async () => {
      const result = await reschedule('TASK-001', {}, createTestDeps())
      expect(result).not.toBeInstanceOf(LoopworkError)
    })

    test('logs success message with scheduled date', async () => {
      const result = await reschedule('TASK-001', { for: '2025-03-15T10:00:00Z' }, createTestDeps())
      expect(result).not.toBeInstanceOf(LoopworkError)
    })

    test('handles backend errors with appropriate error class', async () => {
      const mockBackend = {
        name: 'json',
        findNextTask: async () => null,
        getTask: async () => null,
        listPendingTasks: async () => [],
        countPending: async () => 0,
        markInProgress: async () => ({ success: false, error: 'Test error' }),
        markCompleted: async () => ({ success: false, error: 'Test error' }),
        markFailed: async () => ({ success: false, error: 'Test error' }),
        resetToPending: async () => ({ success: false, error: 'Test error' }),
        getSubTasks: async () => [],
        getDependencies: async () => [],
        areDependenciesMet: async () => true,
        setPriority: async () => ({ success: false, error: 'Test error' }),
        rescheduleCompleted: async () => ({ success: false, error: 'Database connection failed' }),
      }

      const result = await reschedule('TASK-001', {}, createTestDeps({
        getBackendAndConfig: async () => ({ backend: mockBackend, config: { backend: { type: 'json' } } }),
      }))
      expect(result).toBeInstanceOf(LoopworkError)
      expect(result.code).toBe('ERR_BACKEND_INIT')
    })
  })
})
