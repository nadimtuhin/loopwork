import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test'
// Removed type-only import from '../src/adapter'
import { TodoistClient } from '../src'
import type { Task } from '../../loopwork/src/contracts'

const originalFetch = global.fetch
let mockFetch: ReturnType<typeof mock>

beforeEach(() => {
  mockFetch = mock(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
      text: () => Promise.resolve(''),
    })
  )
  global.fetch = mockFetch as any
})

afterEach(() => {
  global.fetch = originalFetch
})

describe('Todoist TaskBackend E2E Tests', () => {
  const projectId = 'test-project-123'

  function createBackend() {
    const client = new TodoistClient('test-token')
    return new TodoistTaskBackend({ client, projectId })
  }

  describe('Full TaskBackend Interface', () => {
    test('findNextTask returns highest priority pending task', async () => {
      const backend = createBackend()

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve([
              { id: 'task-1', content: 'Low priority', is_completed: false, priority: 2, labels: [], project_id: projectId, description: '' },
              { id: 'task-2', content: 'High priority', is_completed: false, priority: 4, labels: [], project_id: projectId, description: '' },
              { id: 'task-3', content: 'Medium priority', is_completed: false, priority: 3, labels: [], project_id: projectId, description: '' },
            ]),
        })
      )

      const task = await backend.findNextTask()

      expect(task).toBeDefined()
      expect(task?.id).toBe('task-2')
      expect(task?.priority).toBe('high')
    })

    test('getTask retrieves specific task by ID', async () => {
      const backend = createBackend()

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: 'task-123',
              content: 'Specific task',
              description: 'Task description',
              is_completed: false,
              priority: 3,
              labels: ['urgent'],
              project_id: projectId,
            }),
        })
      )

      const task = await backend.getTask('task-123')

      expect(task).toBeDefined()
      expect(task?.id).toBe('task-123')
      expect(task?.title).toBe('Specific task')
      expect(task?.description).toBe('Task description')
      expect(task?.priority).toBe('medium')
    })

    test('getTask returns null for non-existent task', async () => {
      const backend = createBackend()

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          text: () => Promise.resolve('Not found'),
        })
      )

      const task = await backend.getTask('nonexistent')
      expect(task).toBeNull()
    })

    test('listPendingTasks returns all incomplete tasks', async () => {
      const backend = createBackend()

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve([
              { id: 'task-1', content: 'Task 1', is_completed: false, priority: 2, labels: [], project_id: projectId, description: '' },
              { id: 'task-2', content: 'Task 2', is_completed: true, priority: 3, labels: [], project_id: projectId, description: '' },
              { id: 'task-3', content: 'Task 3', is_completed: false, priority: 4, labels: [], project_id: projectId, description: '' },
            ]),
        })
      )

      const tasks = await backend.listPendingTasks()

      expect(tasks.length).toBe(2)
      expect(tasks.map(t => t.id)).toEqual(['task-3', 'task-1']) // Sorted by priority
    })

    test('listPendingTasks filters by feature label', async () => {
      const backend = createBackend()

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve([
              { id: 'task-1', content: 'Auth task', is_completed: false, priority: 2, labels: ['feature:auth'], project_id: projectId, description: '' },
              { id: 'task-2', content: 'Payment task', is_completed: false, priority: 3, labels: ['feature:payments'], project_id: projectId, description: '' },
            ]),
        })
      )

      const tasks = await backend.listPendingTasks({ feature: 'auth' })

      expect(tasks.length).toBe(1)
      expect(tasks[0].id).toBe('task-1')
    })

    test('listPendingTasks filters by priority', async () => {
      const backend = createBackend()

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve([
              { id: 'task-1', content: 'Low', is_completed: false, priority: 2, labels: [], project_id: projectId, description: '' },
              { id: 'task-2', content: 'High', is_completed: false, priority: 4, labels: [], project_id: projectId, description: '' },
            ]),
        })
      )

      const tasks = await backend.listPendingTasks({ priority: 'high' })

      expect(tasks.length).toBe(1)
      expect(tasks[0].id).toBe('task-2')
    })

    test('countPending returns correct count', async () => {
      const backend = createBackend()

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve([
              { id: 'task-1', content: 'T1', is_completed: false, priority: 2, labels: [], project_id: projectId, description: '' },
              { id: 'task-2', content: 'T2', is_completed: false, priority: 3, labels: [], project_id: projectId, description: '' },
              { id: 'task-3', content: 'T3', is_completed: true, priority: 2, labels: [], project_id: projectId, description: '' },
            ]),
        })
      )

      const count = await backend.countPending()
      expect(count).toBe(2)
    })

    test('listPendingTasks throws error without projectId', async () => {
      const client = new TodoistClient('test-token')
      const backend = new TodoistTaskBackend({ client }) // No projectId

      await expect(backend.listPendingTasks()).rejects.toThrow('projectId is required')
    })
  })

  describe('Status Transitions', () => {
    test('markInProgress adds label to task', async () => {
      const backend = createBackend()

      // Mock getTask
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: 'task-123',
              content: 'Task',
              is_completed: false,
              priority: 2,
              labels: ['existing'],
              project_id: projectId,
              description: '',
            }),
        })
      )

      // Mock updateTask
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: 'task-123',
              labels: ['existing', 'loopwork:in-progress'],
            }),
        })
      )

      const result = await backend.markInProgress('task-123')

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.todoist.com/rest/v2/tasks/task-123',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ labels: ['existing', 'loopwork:in-progress'] }),
        })
      )
    })

    test('markCompleted closes task and adds comment', async () => {
      const backend = createBackend()

      // Mock completeTask
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 204,
          text: () => Promise.resolve(''),
        })
      )

      // Mock addComment
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'comment-1', task_id: 'task-123', content: 'Done!' }),
        })
      )

      const result = await backend.markCompleted('task-123', 'Done!')

      expect(result.success).toBe(true)

      const calls = mockFetch.mock.calls
      expect(calls[0][0]).toContain('/tasks/task-123/close')
      expect(calls[1][0]).toContain('/comments')
    })

    test('markCompleted without comment only closes task', async () => {
      const backend = createBackend()

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 204,
          text: () => Promise.resolve(''),
        })
      )

      const result = await backend.markCompleted('task-123')

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    test('markFailed adds error comment and label', async () => {
      const backend = createBackend()

      // Mock addComment
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'comment-1' }),
        })
      )

      // Mock getTask
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: 'task-123',
              labels: ['loopwork:in-progress'],
              is_completed: false,
              priority: 2,
              project_id: projectId,
              content: 'Task',
              description: '',
            }),
        })
      )

      // Mock updateTask
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'task-123', labels: ['loopwork:failed'] }),
        })
      )

      const result = await backend.markFailed('task-123', 'Build error')

      expect(result.success).toBe(true)

      const calls = mockFetch.mock.calls
      // Comment call
      expect(calls[0][1].body).toContain('Task failed')
      // Update call to add failed label and remove in-progress
      expect(calls[2][1].body).toContain('loopwork:failed')
    })

    test('resetToPending removes all loopwork labels', async () => {
      const backend = createBackend()

      // Mock getTask
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: 'task-123',
              labels: ['loopwork:failed', 'loopwork:in-progress', 'other-label'],
              is_completed: false,
              priority: 2,
              project_id: projectId,
              content: 'Task',
              description: '',
            }),
        })
      )

      // Mock updateTask
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'task-123', labels: ['other-label'] }),
        })
      )

      const result = await backend.resetToPending('task-123')

      expect(result.success).toBe(true)

      const updateCall = mockFetch.mock.calls[1]
      const body = JSON.parse(updateCall[1].body)
      expect(body.labels).toEqual(['other-label'])
      expect(body.labels).not.toContain('loopwork:failed')
      expect(body.labels).not.toContain('loopwork:in-progress')
    })

    test('resetToPending reopens completed task', async () => {
      const backend = createBackend()

      // Mock getTask
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: 'task-123',
              labels: [],
              is_completed: true,
              priority: 2,
              project_id: projectId,
              content: 'Task',
              description: '',
            }),
        })
      )

      // Mock reopenTask
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 204,
          text: () => Promise.resolve(''),
        })
      )

      // Mock updateTask
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'task-123' }),
        })
      )

      const result = await backend.resetToPending('task-123')

      expect(result.success).toBe(true)

      const calls = mockFetch.mock.calls
      expect(calls[1][0]).toContain('/reopen')
    })
  })

  describe('Task Creation', () => {
    test('createTask creates new task in Todoist', async () => {
      const backend = createBackend()

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: 'new-task-123',
              content: 'New feature',
              description: 'Feature description',
              is_completed: false,
              priority: 4,
              labels: ['feature:auth'],
              project_id: projectId,
            }),
        })
      )

      const task = await backend.createTask({
        title: 'New feature',
        description: 'Feature description',
        priority: 'high',
        feature: 'auth',
      })

      expect(task.id).toBe('new-task-123')
      expect(task.title).toBe('New feature')
      expect(task.priority).toBe('high')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.todoist.com/rest/v2/tasks',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('feature:auth'),
        })
      )
    })

    test('createSubTask creates task with parent', async () => {
      const backend = createBackend()

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: 'subtask-123',
              content: 'Subtask',
              description: '',
              is_completed: false,
              priority: 2,
              labels: [],
              project_id: projectId,
              parent_id: 'parent-task-123',
            }),
        })
      )

      const subtask = await backend.createSubTask('parent-task-123', {
        title: 'Subtask',
        description: '',
        priority: 'low',
      })

      expect(subtask.id).toBe('subtask-123')
      expect(subtask.parentId).toBe('parent-task-123')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.todoist.com/rest/v2/tasks',
        expect.objectContaining({
          body: expect.stringContaining('parent-task-123'),
        })
      )
    })
  })

  describe('Sub-task Management', () => {
    test('getSubTasks returns children of parent task', async () => {
      const backend = createBackend()

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve([
              { id: 'task-1', content: 'Parent', is_completed: false, priority: 2, labels: [], project_id: projectId, description: '' },
              { id: 'task-2', content: 'Child 1', is_completed: false, priority: 2, labels: [], project_id: projectId, description: '', parent_id: 'task-1' },
              { id: 'task-3', content: 'Child 2', is_completed: false, priority: 2, labels: [], project_id: projectId, description: '', parent_id: 'task-1' },
            ]),
        })
      )

      const subtasks = await backend.getSubTasks('task-1')

      expect(subtasks.length).toBe(2)
      expect(subtasks.map(t => t.id)).toEqual(['task-2', 'task-3'])
      expect(subtasks.every(t => t.parentId === 'task-1')).toBe(true)
    })

    test('listPendingTasks with parentId filters correctly', async () => {
      const backend = createBackend()

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve([
              { id: 'task-1', content: 'Parent', is_completed: false, priority: 2, labels: [], project_id: projectId, description: '' },
              { id: 'task-2', content: 'Child', is_completed: false, priority: 2, labels: [], project_id: projectId, description: '', parent_id: 'task-1' },
            ]),
        })
      )

      const tasks = await backend.listPendingTasks({ parentId: 'task-1' })

      expect(tasks.length).toBe(1)
      expect(tasks[0].id).toBe('task-2')
    })

    test('listPendingTasks with topLevelOnly excludes children', async () => {
      const backend = createBackend()

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve([
              { id: 'task-1', content: 'Parent', is_completed: false, priority: 2, labels: [], project_id: projectId, description: '' },
              { id: 'task-2', content: 'Child', is_completed: false, priority: 2, labels: [], project_id: projectId, description: '', parent_id: 'task-1' },
            ]),
        })
      )

      const tasks = await backend.listPendingTasks({ topLevelOnly: true })

      expect(tasks.length).toBe(1)
      expect(tasks[0].id).toBe('task-1')
    })
  })

  describe('Priority Mapping', () => {
    test('Todoist priority 4 maps to high', async () => {
      const backend = createBackend()

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: 'task-1',
              content: 'Urgent',
              is_completed: false,
              priority: 4,
              labels: [],
              project_id: projectId,
              description: '',
            }),
        })
      )

      const task = await backend.getTask('task-1')
      expect(task?.priority).toBe('high')
    })

    test('Todoist priority 3 maps to medium', async () => {
      const backend = createBackend()

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: 'task-1',
              content: 'Medium',
              is_completed: false,
              priority: 3,
              labels: [],
              project_id: projectId,
              description: '',
            }),
        })
      )

      const task = await backend.getTask('task-1')
      expect(task?.priority).toBe('medium')
    })

    test('Todoist priority 2 and 1 map to low', async () => {
      const backend = createBackend()

      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: 'task-1',
              priority: 2,
              content: 'Low',
              is_completed: false,
              labels: [],
              project_id: projectId,
              description: '',
            }),
        })
      )

      const task1 = await backend.getTask('task-1')
      expect(task1?.priority).toBe('low')

      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: 'task-2',
              priority: 1,
              content: 'Natural',
              is_completed: false,
              labels: [],
              project_id: projectId,
              description: '',
            }),
        })
      )

      const task2 = await backend.getTask('task-2')
      expect(task2?.priority).toBe('low')
    })

    test('createTask reverse maps priorities correctly', async () => {
      const backend = createBackend()

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: 'new-task',
              content: 'Task',
              is_completed: false,
              priority: 4,
              labels: [],
              project_id: projectId,
              description: '',
            }),
        })
      )

      await backend.createTask({ title: 'High priority task', description: '', priority: 'high' })

      const call = mockFetch.mock.calls[0]
      const body = JSON.parse(call[1].body)
      expect(body.priority).toBe(4)
    })
  })

  describe('Additional Backend Methods', () => {
    test('addComment adds comment to task', async () => {
      const backend = createBackend()

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'comment-1', content: 'Test comment' }),
        })
      )

      const result = await backend.addComment('task-123', 'Test comment')

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.todoist.com/rest/v2/comments',
        expect.objectContaining({
          body: expect.stringContaining('Test comment'),
        })
      )
    })

    test('ping checks API connectivity', async () => {
      const backend = createBackend()

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([{ id: 'proj-1', name: 'Project' }]),
        })
      )

      const result = await backend.ping()

      expect(result.ok).toBe(true)
      expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    })

    test('ping returns error on failure', async () => {
      const backend = createBackend()

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Unauthorized'),
        })
      )

      const result = await backend.ping()

      expect(result.ok).toBe(false)
      expect(result.error).toContain('Todoist API error')
    })

    test('getDependencies returns empty array (not supported)', async () => {
      const backend = createBackend()
      const deps = await backend.getDependencies('task-123')
      expect(deps).toEqual([])
    })

    test('getDependents returns empty array (not supported)', async () => {
      const backend = createBackend()
      const deps = await backend.getDependents('task-123')
      expect(deps).toEqual([])
    })

    test('areDependenciesMet always returns true (not supported)', async () => {
      const backend = createBackend()
      const met = await backend.areDependenciesMet('task-123')
      expect(met).toBe(true)
    })
  })

  describe('Error Handling', () => {
    test('markInProgress returns error on API failure', async () => {
      const backend = createBackend()

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Server error'),
        })
      )

      const result = await backend.markInProgress('task-123')

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    test('markCompleted returns error on API failure', async () => {
      const backend = createBackend()

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          text: () => Promise.resolve('Not found'),
        })
      )

      const result = await backend.markCompleted('nonexistent')

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    test('listPendingTasks returns empty array on error', async () => {
      const backend = createBackend()

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Server error'),
        })
      )

      const tasks = await backend.listPendingTasks()

      expect(tasks).toEqual([])
    })
  })
})
