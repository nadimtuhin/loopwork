import { describe, test, expect, beforeEach } from 'bun:test'
// Removed type-only import from '../src/mocks/backend'

describe('MemoryTaskBackend', () => {
  let backend: MemoryTaskBackend

  beforeEach(() => {
    backend = new MemoryTaskBackend()
  })

  describe('basic operations', () => {
    test('ping returns healthy status', async () => {
      const result = await backend.ping()
      expect(result.ok).toBe(true)
      expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    })

    test('createTask generates unique IDs', async () => {
      const task1 = await backend.createTask({
        title: 'Task 1',
        description: 'First task',
        priority: 'high',
      })

      const task2 = await backend.createTask({
        title: 'Task 2',
        description: 'Second task',
        priority: 'medium',
      })

      expect(task1.id).toBe('TASK-001')
      expect(task2.id).toBe('TASK-002')
      expect(task1.status).toBe('pending')
      expect(task2.status).toBe('pending')
    })

    test('getTask retrieves task by ID', async () => {
      const created = await backend.createTask({
        title: 'Test Task',
        description: 'Test description',
        priority: 'medium',
      })

      const retrieved = await backend.getTask(created.id)
      expect(retrieved).not.toBeNull()
      expect(retrieved?.id).toBe(created.id)
      expect(retrieved?.title).toBe('Test Task')
    })

    test('getTask returns null for non-existent task', async () => {
      const result = await backend.getTask('NONEXISTENT')
      expect(result).toBeNull()
    })
  })

  describe('task status management', () => {
    test('markInProgress updates task status', async () => {
      const task = await backend.createTask({
        title: 'Task',
        description: 'Desc',
        priority: 'medium',
      })

      const result = await backend.markInProgress(task.id)
      expect(result.success).toBe(true)

      const updated = await backend.getTask(task.id)
      expect(updated?.status).toBe('in-progress')
      expect(updated?.timestamps?.startedAt).toBeDefined()
    })

    test('markCompleted updates task status', async () => {
      const task = await backend.createTask({
        title: 'Task',
        description: 'Desc',
        priority: 'medium',
      })

      await backend.markInProgress(task.id)
      const result = await backend.markCompleted(task.id, 'Completed successfully')
      expect(result.success).toBe(true)

      const updated = await backend.getTask(task.id)
      expect(updated?.status).toBe('completed')
      expect(updated?.timestamps?.completedAt).toBeDefined()
    })

    test('markFailed updates task status and tracks failure count', async () => {
      const task = await backend.createTask({
        title: 'Task',
        description: 'Desc',
        priority: 'medium',
      })

      await backend.markInProgress(task.id)
      const result = await backend.markFailed(task.id, 'Something went wrong')
      expect(result.success).toBe(true)

      const updated = await backend.getTask(task.id)
      expect(updated?.status).toBe('failed')
      expect(updated?.failureCount).toBe(1)
      expect(updated?.lastError).toContain('Something went wrong')
    })

    test('resetToPending resets task to pending status', async () => {
      const task = await backend.createTask({
        title: 'Task',
        description: 'Desc',
        priority: 'medium',
      })

      await backend.markInProgress(task.id)
      await backend.markFailed(task.id, 'Error')

      const result = await backend.resetToPending(task.id)
      expect(result.success).toBe(true)

      const updated = await backend.getTask(task.id)
      expect(updated?.status).toBe('pending')
      expect(updated?.timestamps?.failedAt).toBeUndefined()
    })
  })

  describe('task listing and filtering', () => {
    beforeEach(async () => {
      await backend.createTask({ title: 'High Auth', description: '', priority: 'high', feature: 'auth' })
      await backend.createTask({ title: 'Medium Auth', description: '', priority: 'medium', feature: 'auth' })
      await backend.createTask({ title: 'Low API', description: '', priority: 'low', feature: 'api' })
    })

    test('listPendingTasks returns all pending tasks', async () => {
      const tasks = await backend.listPendingTasks()
      expect(tasks.length).toBe(3)
      expect(tasks.every(t => t.status === 'pending')).toBe(true)
    })

    test('listPendingTasks filters by feature', async () => {
      const tasks = await backend.listPendingTasks({ feature: 'auth' })
      expect(tasks.length).toBe(2)
      expect(tasks.every(t => t.feature === 'auth')).toBe(true)
    })

    test('listPendingTasks filters by priority', async () => {
      const tasks = await backend.listPendingTasks({ priority: 'high' })
      expect(tasks.length).toBe(1)
      expect(tasks[0].priority).toBe('high')
    })

    test('listPendingTasks sorts by priority', async () => {
      const tasks = await backend.listPendingTasks()
      expect(tasks[0].priority).toBe('high')
      expect(tasks[1].priority).toBe('medium')
      expect(tasks[2].priority).toBe('low')
    })

    test('countPending returns correct count', async () => {
      const count = await backend.countPending()
      expect(count).toBe(3)

      const authCount = await backend.countPending({ feature: 'auth' })
      expect(authCount).toBe(2)
    })
  })

  describe('sub-tasks', () => {
    test('createSubTask creates sub-task with correct ID', async () => {
      const parent = await backend.createTask({
        title: 'Parent',
        description: 'Parent task',
        priority: 'high',
      })

      const sub1 = await backend.createSubTask(parent.id, {
        title: 'Sub 1',
        description: 'First sub-task',
        priority: 'medium',
      })

      const sub2 = await backend.createSubTask(parent.id, {
        title: 'Sub 2',
        description: 'Second sub-task',
        priority: 'medium',
      })

      expect(sub1.id).toBe(`${parent.id}a`)
      expect(sub2.id).toBe(`${parent.id}b`)
      expect(sub1.parentId).toBe(parent.id)
      expect(sub2.parentId).toBe(parent.id)
    })

    test('getSubTasks returns all sub-tasks of a parent', async () => {
      const parent = await backend.createTask({
        title: 'Parent',
        description: 'Parent task',
        priority: 'high',
      })

      await backend.createSubTask(parent.id, {
        title: 'Sub 1',
        description: 'First',
        priority: 'medium',
      })

      await backend.createSubTask(parent.id, {
        title: 'Sub 2',
        description: 'Second',
        priority: 'medium',
      })

      const subTasks = await backend.getSubTasks(parent.id)
      expect(subTasks.length).toBe(2)
      expect(subTasks.every(t => t.parentId === parent.id)).toBe(true)
    })
  })

  describe('dependencies', () => {
    test('addDependency creates dependency relationship', async () => {
      const task1 = await backend.createTask({
        title: 'Task 1',
        description: 'First',
        priority: 'high',
      })

      const task2 = await backend.createTask({
        title: 'Task 2',
        description: 'Second',
        priority: 'high',
      })

      const result = await backend.addDependency(task2.id, task1.id)
      expect(result.success).toBe(true)

      const updated = await backend.getTask(task2.id)
      expect(updated?.dependsOn).toContain(task1.id)
    })

    test('areDependenciesMet returns false when dependencies not completed', async () => {
      const task1 = await backend.createTask({
        title: 'Task 1',
        description: 'First',
        priority: 'high',
      })

      const task2 = await backend.createTask({
        title: 'Task 2',
        description: 'Second',
        priority: 'high',
      })

      await backend.addDependency(task2.id, task1.id)

      const met = await backend.areDependenciesMet(task2.id)
      expect(met).toBe(false)
    })

    test('areDependenciesMet returns true when dependencies completed', async () => {
      const task1 = await backend.createTask({
        title: 'Task 1',
        description: 'First',
        priority: 'high',
      })

      const task2 = await backend.createTask({
        title: 'Task 2',
        description: 'Second',
        priority: 'high',
      })

      await backend.addDependency(task2.id, task1.id)
      await backend.markInProgress(task1.id)
      await backend.markCompleted(task1.id)

      const met = await backend.areDependenciesMet(task2.id)
      expect(met).toBe(true)
    })

    test('listPendingTasks excludes blocked tasks by default', async () => {
      const task1 = await backend.createTask({
        title: 'Task 1',
        description: 'First',
        priority: 'high',
      })

      const task2 = await backend.createTask({
        title: 'Task 2',
        description: 'Second',
        priority: 'high',
      })

      await backend.addDependency(task2.id, task1.id)

      const tasks = await backend.listPendingTasks()
      expect(tasks.length).toBe(1)
      expect(tasks[0].id).toBe(task1.id)
    })

    test('getDependencies returns tasks that a task depends on', async () => {
      const task1 = await backend.createTask({
        title: 'Task 1',
        description: 'First',
        priority: 'high',
      })

      const task2 = await backend.createTask({
        title: 'Task 2',
        description: 'Second',
        priority: 'high',
      })

      await backend.addDependency(task2.id, task1.id)

      const deps = await backend.getDependencies(task2.id)
      expect(deps.length).toBe(1)
      expect(deps[0].id).toBe(task1.id)
    })

    test('getDependents returns tasks that depend on a task', async () => {
      const task1 = await backend.createTask({
        title: 'Task 1',
        description: 'First',
        priority: 'high',
      })

      const task2 = await backend.createTask({
        title: 'Task 2',
        description: 'Second',
        priority: 'high',
      })

      await backend.addDependency(task2.id, task1.id)

      const dependents = await backend.getDependents(task1.id)
      expect(dependents.length).toBe(1)
      expect(dependents[0].id).toBe(task2.id)
    })
  })

  describe('claimTask', () => {
    test('claimTask atomically finds and marks task in-progress', async () => {
      await backend.createTask({
        title: 'Task 1',
        description: 'First',
        priority: 'high',
      })

      const claimed = await backend.claimTask()
      expect(claimed).not.toBeNull()
      expect(claimed?.status).toBe('in-progress')

      const tasks = await backend.listPendingTasks()
      expect(tasks.length).toBe(0)
    })

    test('claimTask returns null when no tasks available', async () => {
      const claimed = await backend.claimTask()
      expect(claimed).toBeNull()
    })
  })

  describe('clear and reset', () => {
    test('clear removes all tasks', async () => {
      await backend.createTask({ title: 'Task 1', description: '', priority: 'high' })
      await backend.createTask({ title: 'Task 2', description: '', priority: 'medium' })

      backend.clear()

      const tasks = await backend.listPendingTasks()
      expect(tasks.length).toBe(0)
    })

    test('clear resets ID counter', async () => {
      await backend.createTask({ title: 'Task 1', description: '', priority: 'high' })
      backend.clear()

      const task = await backend.createTask({ title: 'Task 2', description: '', priority: 'high' })
      expect(task.id).toBe('TASK-001')
    })
  })
})
