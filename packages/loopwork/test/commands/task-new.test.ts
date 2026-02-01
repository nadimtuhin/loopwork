import { describe, test, expect, beforeEach, afterEach, spyOn, mock } from 'bun:test'
import fs from 'fs'
import path from 'path'
import os from 'os'

/**
 * Tests for the task-new command using dependency injection (adapter pattern).
 * No mock.module() used to avoid test pollution.
 */

import { taskNew } from '../../src/commands/task-new'
// Removed type-only import from '../../src/backends/json'
import { LoopworkError } from '../../src/core/errors'

describe('task-new command', () => {
  let tempDir: string
  let tasksFile: string
  let tasksDir: string
  let mockConfig: any

  // Create test dependencies with injected config
  function createTestDeps(overrides: any = {}) {
    return {
      getConfig: async () => mockConfig,
      createBackend: (backendConfig: any) => new JsonTaskAdapter(backendConfig),
      logger: {
        info: mock(() => {}),
        success: mock(() => {}),
        warn: mock(() => {}),
        error: mock(() => {}),
        debug: mock(() => {}),
      },
      LoopworkErrorClass: LoopworkError,
      ...overrides,
    }
  }

  beforeEach(() => {
    // Create temp directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loopwork-task-new-test-'))
    tasksDir = path.join(tempDir, '.specs/tasks')
    tasksFile = path.join(tasksDir, 'tasks.json')

    // Create task directory
    fs.mkdirSync(tasksDir, { recursive: true })

    // Reset config
    mockConfig = {
      backend: {
        type: 'json',
        tasksFile,
        tasksDir,
      },
    }
  })

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  describe('validation', () => {
    test('throws error when title is missing', async () => {
      await expect(taskNew({}, createTestDeps())).rejects.toThrow(LoopworkError)
      await expect(taskNew({}, createTestDeps())).rejects.toThrow('Task title is required')
    })

    test('throws error when title is empty string', async () => {
      await expect(taskNew({ title: '' }, createTestDeps())).rejects.toThrow(LoopworkError)
    })

    test('throws error when backend does not support createTask', async () => {
      // Create a backend without createTask method
      const deps = createTestDeps({
        createBackend: () => ({
          name: 'mock-backend',
          // No createTask method
        }),
      })

      await expect(
        taskNew({ title: 'Test task' }, deps)
      ).rejects.toThrow(LoopworkError)
    })
  })

  describe('creating top-level tasks', () => {
    beforeEach(() => {
      // Create initial tasks.json
      fs.writeFileSync(
        tasksFile,
        JSON.stringify({
          tasks: [
            { id: 'TASK-001', status: 'pending', priority: 'high' },
            { id: 'TASK-002', status: 'completed', priority: 'medium' },
          ],
          features: {},
        })
      )

      // Create PRD files for existing tasks
      fs.writeFileSync(path.join(tasksDir, 'TASK-001.md'), '# TASK-001: First task')
      fs.writeFileSync(path.join(tasksDir, 'TASK-002.md'), '# TASK-002: Second task')
    })

    test('creates new task with auto-incremented ID', async () => {
      await taskNew({
        title: 'Add user authentication',
        description: 'Implement JWT-based authentication',
        priority: 'high',
      }, createTestDeps())

      // Verify task was added to tasks.json
      const data = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'))
      const newTask = data.tasks.find((t: any) => t.id === 'TASK-003')

      expect(newTask).toBeDefined()
      expect(newTask.status).toBe('pending')
      expect(newTask.priority).toBe('high')
    })

    test('creates PRD file for new task', async () => {
      await taskNew({
        title: 'Add user authentication',
        description: 'Implement JWT-based authentication',
      }, createTestDeps())

      // Verify PRD file was created
      const prdFile = path.join(tasksDir, 'TASK-003.md')
      expect(fs.existsSync(prdFile)).toBe(true)

      const content = fs.readFileSync(prdFile, 'utf-8')
      expect(content).toContain('Add user authentication')
      expect(content).toContain('Implement JWT-based authentication')
    })

    test('uses default priority when not specified', async () => {
      await taskNew({
        title: 'Test task without priority',
      }, createTestDeps())

      const data = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'))
      const newTask = data.tasks.find((t: any) => t.id === 'TASK-003')

      expect(newTask.priority).toBe('medium')
    })

    test('uses empty description when not provided', async () => {
      await taskNew({
        title: 'Test task',
      }, createTestDeps())

      const prdFile = path.join(tasksDir, 'TASK-003.md')
      const content = fs.readFileSync(prdFile, 'utf-8')

      expect(content).toContain('# Test task')
    })

    test('uses feature prefix for task ID when feature is provided', async () => {
      await taskNew({
        title: 'Add login form',
        feature: 'auth',
        priority: 'high',
      }, createTestDeps())

      const data = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'))
      const newTask = data.tasks.find((t: any) => t.id === 'AUTH-001')

      expect(newTask).toBeDefined()
      expect(newTask.feature).toBe('auth')
    })

    test('logs success message with task ID and PRD file', async () => {
      const deps = createTestDeps()
      const loggerSuccess = deps.logger.success as ReturnType<typeof mock>
      const loggerInfo = deps.logger.info as ReturnType<typeof mock>

      await taskNew({
        title: 'New feature',
        description: 'Feature description',
      }, deps)

      // Verify success message was logged
      expect(loggerSuccess).toHaveBeenCalled()
      const successCalls = loggerSuccess.mock.calls.map((c: any) => c[0])
      expect(successCalls.some((msg: string) => msg.includes('TASK-003'))).toBe(true)

      // Verify PRD file info was logged
      expect(loggerInfo).toHaveBeenCalled()
      const infoCalls = loggerInfo.mock.calls.map((c: any) => c[0])
      expect(infoCalls.some((msg: string) => msg.includes('PRD file:'))).toBe(true)
    })

    test('handles all priority levels', async () => {
      const priorities = ['high', 'medium', 'low'] as const

      for (const priority of priorities) {
        const title = `Task with ${priority} priority`
        await taskNew({ title, priority }, createTestDeps())
      }

      const data = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'))

      expect(data.tasks.find((t: any) => t.priority === 'high')).toBeDefined()
      expect(data.tasks.find((t: any) => t.priority === 'medium')).toBeDefined()
      expect(data.tasks.find((t: any) => t.priority === 'low')).toBeDefined()
    })
  })

  describe('creating sub-tasks', () => {
    beforeEach(() => {
      // Create tasks.json with a parent task
      fs.writeFileSync(
        tasksFile,
        JSON.stringify({
          tasks: [
            { id: 'TASK-001', status: 'pending', priority: 'high' },
            { id: 'TASK-001a', status: 'completed', priority: 'medium', parentId: 'TASK-001' },
          ],
          features: {},
        })
      )

      fs.writeFileSync(path.join(tasksDir, 'TASK-001.md'), '# TASK-001: Parent task')
      fs.writeFileSync(path.join(tasksDir, 'TASK-001a.md'), '# TASK-001a: First sub-task')
    })

    test('creates sub-task with correct ID format', async () => {
      const adapter = new JsonTaskAdapter(mockConfig.backend)

      const subtask = await adapter.createSubTask('TASK-001', {
        title: 'Sub-task title',
        description: 'Sub-task description',
        priority: 'high',
      })

      expect(subtask.id).toBe('TASK-001b')
      expect(subtask.parentId).toBe('TASK-001')
      expect(subtask.status).toBe('pending')
    })

    test('creates PRD file for sub-task', async () => {
      const adapter = new JsonTaskAdapter(mockConfig.backend)

      await adapter.createSubTask('TASK-001', {
        title: 'Implement validation',
        description: 'Add input validation',
        priority: 'medium',
      })

      const prdFile = path.join(tasksDir, 'TASK-001b.md')
      expect(fs.existsSync(prdFile)).toBe(true)

      const content = fs.readFileSync(prdFile, 'utf-8')
      expect(content).toContain('Implement validation')
      expect(content).toContain('Add input validation')
    })

    test('increments sub-task suffix correctly', async () => {
      const adapter = new JsonTaskAdapter(mockConfig.backend)

      // Create second and third sub-tasks
      const subtask2 = await adapter.createSubTask('TASK-001', {
        title: 'Second sub-task',
        description: 'Description',
        priority: 'medium',
      })

      const subtask3 = await adapter.createSubTask('TASK-001', {
        title: 'Third sub-task',
        description: 'Description',
        priority: 'low',
      })

      expect(subtask2.id).toBe('TASK-001b')
      expect(subtask3.id).toBe('TASK-001c')
    })

    test('throws error when parent task does not exist', async () => {
      const adapter = new JsonTaskAdapter(mockConfig.backend)

      await expect(
        adapter.createSubTask('TASK-999', {
          title: 'Orphan sub-task',
          description: 'Description',
          priority: 'medium',
        })
      ).rejects.toThrow('Parent task TASK-999 not found')
    })
  })

  describe('task ID auto-increment', () => {
    test('generates TASK-001 when no tasks exist', async () => {
      fs.writeFileSync(
        tasksFile,
        JSON.stringify({ tasks: [], features: {} })
      )

      await taskNew({ title: 'First task' }, createTestDeps())

      const data = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'))
      const newTask = data.tasks.find((t: any) => t.id === 'TASK-001')

      expect(newTask).toBeDefined()
    })

    test('finds next available ID with gaps', async () => {
      fs.writeFileSync(
        tasksFile,
        JSON.stringify({
          tasks: [
            { id: 'TASK-001', status: 'completed' },
            { id: 'TASK-003', status: 'pending' }, // Gap at TASK-002
            { id: 'TASK-004', status: 'pending' },
          ],
          features: {},
        })
      )

      await taskNew({ title: 'Fill the gap' }, createTestDeps())

      const data = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'))
      const newTask = data.tasks.find((t: any) => t.id === 'TASK-002')

      expect(newTask).toBeDefined()
    })

    test('generates feature-prefixed ID correctly', async () => {
      fs.writeFileSync(
        tasksFile,
        JSON.stringify({
          tasks: [
            { id: 'AUTH-001', status: 'pending', feature: 'auth' },
            { id: 'AUTH-002', status: 'completed', feature: 'auth' },
          ],
          features: { auth: { name: 'Authentication' } },
        })
      )

      await taskNew({ title: 'New auth task', feature: 'auth' }, createTestDeps())

      const data = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'))
      const newTask = data.tasks.find((t: any) => t.id === 'AUTH-003')

      expect(newTask).toBeDefined()
      expect(newTask.feature).toBe('auth')
    })

    test('pads task numbers with zeros', async () => {
      fs.writeFileSync(
        tasksFile,
        JSON.stringify({
          tasks: [
            { id: 'TASK-001', status: 'pending' },
            { id: 'TASK-009', status: 'pending' },
          ],
          features: {},
        })
      )

      await taskNew({ title: 'Test padding' }, createTestDeps())

      const data = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'))

      // Should create TASK-002 (fills gap) or if sequential TASK-010
      const hasValidId = data.tasks.some((t: any) =>
        t.id === 'TASK-002' || t.id === 'TASK-010'
      )
      expect(hasValidId).toBe(true)
    })
  })

  describe('error handling', () => {
    test('throws LoopworkError with suggestions when title missing', async () => {
      try {
        await taskNew({}, createTestDeps())
        expect.unreachable('Should have thrown')
      } catch (error: any) {
        expect(error).toBeInstanceOf(LoopworkError)
        expect(error.suggestions).toBeDefined()
        expect(error.suggestions.length).toBeGreaterThan(0)
        expect(error.suggestions[0]).toContain('--title')
      }
    })

    test('throws LoopworkError when createTask fails', async () => {
      fs.writeFileSync(
        tasksFile,
        JSON.stringify({ tasks: [] })
      )

      // Make tasks file read-only to cause write failure
      fs.chmodSync(tasksFile, 0o444)

      try {
        await taskNew({ title: 'Should fail' }, createTestDeps())
        expect.unreachable('Should have thrown')
      } catch (error: any) {
        expect(error).toBeInstanceOf(LoopworkError)
        expect(error.message).toContain('Failed to create task')
        expect(error.suggestions).toBeDefined()
      } finally {
        // Restore permissions for cleanup
        fs.chmodSync(tasksFile, 0o644)
      }
    })

    test('handles missing tasks file gracefully', async () => {
      // Remove tasks file
      if (fs.existsSync(tasksFile)) {
        fs.unlinkSync(tasksFile)
      }

      await expect(taskNew({ title: 'Test' }, createTestDeps())).rejects.toThrow()
    })

    test('provides helpful error message when backend fails', async () => {
      // Create a backend that throws
      const deps = createTestDeps({
        createBackend: () => ({
          name: 'failing-backend',
          createTask: async () => {
            throw new Error('Backend connection failed')
          },
        }),
      })

      try {
        await taskNew({ title: 'Test task' }, deps)
        expect.unreachable('Should have thrown')
      } catch (error: any) {
        expect(error).toBeInstanceOf(LoopworkError)
        expect(error.message).toContain('Failed to create task')
        expect(error.suggestions.length).toBeGreaterThan(0)
      }
    })
  })

  describe('file locking', () => {
    test('handles concurrent task creation', async () => {
      fs.writeFileSync(
        tasksFile,
        JSON.stringify({ tasks: [], features: {} })
      )

      // Create multiple tasks concurrently
      const results = await Promise.all([
        taskNew({ title: 'Task 1' }, createTestDeps()),
        taskNew({ title: 'Task 2' }, createTestDeps()),
        taskNew({ title: 'Task 3' }, createTestDeps()),
      ])

      // All should succeed
      expect(results).toHaveLength(3)

      // Verify all tasks were created with unique IDs
      const data = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'))
      expect(data.tasks).toHaveLength(3)

      const ids = data.tasks.map((t: any) => t.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(3)
    })
  })

  describe('integration with backend', () => {
    test('uses backend createTask method', async () => {
      fs.writeFileSync(
        tasksFile,
        JSON.stringify({ tasks: [], features: {} })
      )

      await taskNew({
        title: 'Integration test task',
        description: 'Testing backend integration',
        priority: 'high',
        feature: 'testing',
      }, createTestDeps())

      const data = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'))
      const task = data.tasks[0]

      expect(task).toBeDefined()
      expect(task.id).toMatch(/^TESTING-\d{3}$/)
      expect(task.feature).toBe('testing')
      expect(task.priority).toBe('high')
      expect(task.status).toBe('pending')
    })

    test('returns task metadata including PRD file path', async () => {
      fs.writeFileSync(
        tasksFile,
        JSON.stringify({ tasks: [], features: {} })
      )

      const deps = createTestDeps()
      const loggerInfo = deps.logger.info as ReturnType<typeof mock>

      await taskNew({ title: 'Test metadata' }, deps)

      // Logger should show PRD file path
      const infoCalls = loggerInfo.mock.calls.map((c: any) => c[0])
      expect(infoCalls.some((msg: string) => msg.includes('.md'))).toBe(true)
    })
  })
})
