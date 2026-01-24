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
} from '../src/backends'
import * as utils from '../src/core/utils'

describe('Backend Factory', () => {
  let tempTasksFile: string

  beforeEach(() => {
    tempTasksFile = path.join(fs.realpathSync(os.tmpdir()), `tasks-${Math.random().toString(36).slice(2)}.json`)
  })

  test('creates GitHubTaskAdapter for github type', () => {
    const backend = createBackend({ type: 'github' })
    expect(backend.name).toBe('github')
    expect(backend).toBeInstanceOf(GitHubTaskAdapter)
  })

  test('creates JsonTaskAdapter for json type', () => {
    const backend = createBackend({ type: 'json', tasksFile: tempTasksFile })
    expect(backend.name).toBe('json')
    expect(backend).toBeInstanceOf(JsonTaskAdapter)
  })

  test('throws for unknown backend type', () => {
    expect(() => {
      createBackend({ type: 'unknown' as any })
    }).toThrow('Unknown backend type')
  })

  test('passes config to GitHubTaskAdapter', () => {
    const backend = createBackend({ type: 'github', repo: 'owner/repo' })
    expect(backend.name).toBe('github')
  })

  test('passes config to JsonTaskAdapter', () => {
    const backend = createBackend({
      type: 'json',
      tasksFile: '/custom/path/tasks.json',
      tasksDir: '/custom/path',
    })
    expect(backend.name).toBe('json')
  })
})

describe('TaskBackend Interface', () => {
  const backends: { name: string; create: () => TaskBackend }[] = [
    {
      name: 'GitHubTaskAdapter',
      create: () => new GitHubTaskAdapter({ type: 'github' }),
    },
    {
      name: 'JsonTaskAdapter',
      create: () => new JsonTaskAdapter({ type: 'json', tasksFile: path.join(os.tmpdir(), `nonexistent-${Math.random().toString(36).slice(2)}.json`) }),
    },
  ]

  for (const { name, create } of backends) {
    describe(name, () => {
      let backend: TaskBackend

      beforeEach(() => {
        backend = create()
      })

      test('has name property', () => {
        expect(typeof backend.name).toBe('string')
        expect(backend.name.length).toBeGreaterThan(0)
      })

      test('has findNextTask method', () => {
        expect(typeof backend.findNextTask).toBe('function')
      })

      test('has getTask method', () => {
        expect(typeof backend.getTask).toBe('function')
      })

      test('has listPendingTasks method', () => {
        expect(typeof backend.listPendingTasks).toBe('function')
      })

      test('has countPending method', () => {
        expect(typeof backend.countPending).toBe('function')
      })

      test('has markInProgress method', () => {
        expect(typeof backend.markInProgress).toBe('function')
      })

      test('has markCompleted method', () => {
        expect(typeof backend.markCompleted).toBe('function')
      })

      test('has markFailed method', () => {
        expect(typeof backend.markFailed).toBe('function')
      })

      test('has resetToPending method', () => {
        expect(typeof backend.resetToPending).toBe('function')
      })
    })
  }
})

describe('JsonTaskAdapter', () => {
  let tempDir: string
  let tasksFile: string
  let adapter: JsonTaskAdapter

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-json-test-'))
    tasksFile = path.join(tempDir, 'tasks.json')
    adapter = new JsonTaskAdapter({
      type: 'json',
      tasksFile,
      tasksDir: tempDir,
    })

    // Mock logger
    spyOn(utils.logger, 'info').mockImplementation(() => {})
    spyOn(utils.logger, 'success').mockImplementation(() => {})
    spyOn(utils.logger, 'warn').mockImplementation(() => {})
    spyOn(utils.logger, 'error').mockImplementation(() => {})
    spyOn(utils.logger, 'debug').mockImplementation(() => {})
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test('returns null when tasks file does not exist', async () => {
    const task = await adapter.findNextTask()
    expect(task).toBeNull()
  })

  test('returns empty array when tasks file does not exist', async () => {
    const tasks = await adapter.listPendingTasks()
    expect(tasks).toEqual([])
  })

  test('returns 0 count when tasks file does not exist', async () => {
    const count = await adapter.countPending()
    expect(count).toBe(0)
  })

  describe('with tasks file', () => {
    beforeEach(() => {
      const tasksData = {
        tasks: [
          { id: 'TASK-001-01', status: 'pending', priority: 'high', feature: 'auth' },
          { id: 'TASK-001-02', status: 'pending', priority: 'low' },
          { id: 'TASK-002-01', status: 'completed' },
          { id: 'TASK-003-01', status: 'in-progress' },
        ],
        features: {
          auth: { name: 'Authentication' },
        },
      }
      fs.writeFileSync(tasksFile, JSON.stringify(tasksData, null, 2))

      // Create PRD files
      fs.writeFileSync(
        path.join(tempDir, 'TASK-001-01.md'),
        '# TASK-001-01: Implement login\n\n## Goal\nAdd login functionality'
      )
      fs.writeFileSync(
        path.join(tempDir, 'TASK-001-02.md'),
        '# TASK-001-02: Add logout\n\n## Goal\nAdd logout button'
      )
    })

    test('finds next pending task', async () => {
      const task = await adapter.findNextTask()
      expect(task).not.toBeNull()
      expect(task!.status).toBe('pending')
    })

    test('returns high priority tasks first', async () => {
      const task = await adapter.findNextTask()
      expect(task!.id).toBe('TASK-001-01')
      expect(task!.priority).toBe('high')
    })

    test('filters by feature', async () => {
      const tasks = await adapter.listPendingTasks({ feature: 'auth' })
      expect(tasks.length).toBe(1)
      expect(tasks[0].feature).toBe('auth')
    })

    test('counts pending tasks', async () => {
      const count = await adapter.countPending()
      expect(count).toBe(2)
    })

    test('gets specific task by ID', async () => {
      const task = await adapter.getTask('TASK-001-01')
      expect(task).not.toBeNull()
      expect(task!.id).toBe('TASK-001-01')
      expect(task!.title).toBe('TASK-001-01: Implement login')
    })

    test('returns null for non-existent task', async () => {
      const task = await adapter.getTask('TASK-999-99')
      expect(task).toBeNull()
    })

    test('loads PRD content as description', async () => {
      const task = await adapter.getTask('TASK-001-01')
      expect(task!.description).toContain('## Goal')
      expect(task!.description).toContain('Add login functionality')
    })

    test('marks task in progress', async () => {
      const result = await adapter.markInProgress('TASK-001-01')
      expect(result.success).toBe(true)

      const data = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'))
      const task = data.tasks.find((t: any) => t.id === 'TASK-001-01')
      expect(task.status).toBe('in-progress')
    })

    test('marks task completed', async () => {
      const result = await adapter.markCompleted('TASK-001-01')
      expect(result.success).toBe(true)

      const data = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'))
      const task = data.tasks.find((t: any) => t.id === 'TASK-001-01')
      expect(task.status).toBe('completed')
    })

    test('marks task failed', async () => {
      const result = await adapter.markFailed('TASK-001-01', 'Test error')
      expect(result.success).toBe(true)

      const data = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'))
      const task = data.tasks.find((t: any) => t.id === 'TASK-001-01')
      expect(task.status).toBe('failed')
    })

    test('resets task to pending', async () => {
      await adapter.markFailed('TASK-001-01', 'Error')
      const result = await adapter.resetToPending('TASK-001-01')
      expect(result.success).toBe(true)

      const data = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'))
      const task = data.tasks.find((t: any) => t.id === 'TASK-001-01')
      expect(task.status).toBe('pending')
    })

    test('adds comment to log file', async () => {
      const result = await adapter.addComment!('TASK-001-01', 'Test comment')
      expect(result.success).toBe(true)

      const logFile = path.join(tempDir, 'TASK-001-01.log')
      expect(fs.existsSync(logFile)).toBe(true)
      const content = fs.readFileSync(logFile, 'utf-8')
      expect(content).toContain('Test comment')
    })

    test('returns error for non-existent task update', async () => {
      const result = await adapter.markInProgress('TASK-999-99')
      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })
  })
})

describe('GitHubTaskAdapter', () => {
  let adapter: GitHubTaskAdapter

  beforeEach(() => {
    adapter = new GitHubTaskAdapter({ type: 'github', repo: 'test/repo' })
  })

  test('has correct name', () => {
    expect(adapter.name).toBe('github')
  })

  // Note: Full GitHub integration tests would require mocking gh CLI
  // These tests verify the adapter structure and basic logic

  test('adaptIssue extracts task ID from title', () => {
    const issue = {
      number: 123,
      title: 'TASK-025-01: Add health score',
      body: 'PRD content',
      state: 'open' as const,
      labels: [{ name: 'loopwork-task' }, { name: 'loopwork:pending' }],
      url: 'https://github.com/test/repo/issues/123',
    }

    const task = (adapter as any).adaptIssue(issue)
    expect(task.id).toBe('TASK-025-01')
    expect(task.title).toBe('TASK-025-01: Add health score')
    expect(task.description).toBe('PRD content')
    expect(task.status).toBe('pending')
  })

  test('adaptIssue generates GH-{number} for non-standard titles', () => {
    const issue = {
      number: 456,
      title: 'Fix bug in login',
      body: 'Bug description',
      state: 'open' as const,
      labels: [{ name: 'loopwork-task' }],
      url: 'https://github.com/test/repo/issues/456',
    }

    const task = (adapter as any).adaptIssue(issue)
    expect(task.id).toBe('GH-456')
  })

  test('adaptIssue detects priority from labels', () => {
    const highPriority = {
      number: 1,
      title: 'TASK-001-01: High priority',
      body: '',
      state: 'open' as const,
      labels: [{ name: 'loopwork-task' }, { name: 'priority:high' }],
      url: 'https://github.com/test/repo/issues/1',
    }

    const lowPriority = {
      number: 2,
      title: 'TASK-001-02: Low priority',
      body: '',
      state: 'open' as const,
      labels: [{ name: 'loopwork-task' }, { name: 'priority:low' }],
      url: 'https://github.com/test/repo/issues/2',
    }

    expect((adapter as any).adaptIssue(highPriority).priority).toBe('high')
    expect((adapter as any).adaptIssue(lowPriority).priority).toBe('low')
  })

  test('adaptIssue extracts feature from labels', () => {
    const issue = {
      number: 1,
      title: 'TASK-001-01: Feature task',
      body: '',
      state: 'open' as const,
      labels: [{ name: 'loopwork-task' }, { name: 'feat:authentication' }],
      url: 'https://github.com/test/repo/issues/1',
    }

    const task = (adapter as any).adaptIssue(issue)
    expect(task.feature).toBe('authentication')
  })

  test('extractIssueNumber handles GH-{number} format', () => {
    expect((adapter as any).extractIssueNumber('GH-123')).toBe(123)
    expect((adapter as any).extractIssueNumber('GH-456')).toBe(456)
  })

  test('extractIssueNumber handles plain numbers', () => {
    expect((adapter as any).extractIssueNumber('123')).toBe(123)
    expect((adapter as any).extractIssueNumber('456')).toBe(456)
  })

  test('extractIssueNumber returns null for invalid input', () => {
    expect((adapter as any).extractIssueNumber('invalid')).toBeNull()
    expect((adapter as any).extractIssueNumber('TASK-001-01')).toBeNull()
  })
})

describe('Task Interface', () => {
  test('Task has required fields', () => {
    const task: Task = {
      id: 'TASK-001-01',
      title: 'Test task',
      description: 'Task description',
      status: 'pending',
      priority: 'medium',
    }

    expect(task.id).toBeDefined()
    expect(task.title).toBeDefined()
    expect(task.description).toBeDefined()
    expect(task.status).toBeDefined()
    expect(task.priority).toBeDefined()
  })

  test('Task supports optional fields', () => {
    const task: Task = {
      id: 'TASK-001-01',
      title: 'Test task',
      description: 'Description',
      status: 'pending',
      priority: 'high',
      feature: 'auth',
      metadata: {
        issueNumber: 123,
        url: 'https://example.com',
      },
    }

    expect(task.feature).toBe('auth')
    expect(task.metadata?.issueNumber).toBe(123)
  })

  test('TaskStatus has valid values', () => {
    const validStatuses = ['pending', 'in-progress', 'completed', 'failed']
    const task: Task = {
      id: 'test',
      title: 'test',
      description: '',
      status: 'pending',
      priority: 'medium',
    }

    for (const status of validStatuses) {
      task.status = status as Task['status']
      expect(validStatuses).toContain(task.status)
    }
  })

  test('Priority has valid values', () => {
    const validPriorities = ['high', 'medium', 'low']
    const task: Task = {
      id: 'test',
      title: 'test',
      description: '',
      status: 'pending',
      priority: 'medium',
    }

    for (const priority of validPriorities) {
      task.priority = priority as Task['priority']
      expect(validPriorities).toContain(task.priority)
    }
  })
})

describe('Health Check (ping)', () => {
  describe('JsonTaskAdapter ping', () => {
    let tempDir: string

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-ping-test-'))
    })

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true })
    })

    test('returns ok:true when tasks file exists and is valid', async () => {
      const tasksFile = path.join(tempDir, 'tasks.json')
      fs.writeFileSync(tasksFile, JSON.stringify({ tasks: [] }))

      const adapter = new JsonTaskAdapter({ type: 'json', tasksFile, tasksDir: tempDir })
      const result = await adapter.ping()

      expect(result.ok).toBe(true)
      expect(result.latencyMs).toBeGreaterThanOrEqual(0)
      expect(result.error).toBeUndefined()
    })

    test('returns ok:false when tasks file does not exist', async () => {
      const adapter = new JsonTaskAdapter({
        type: 'json',
        tasksFile: path.join(tempDir, 'nonexistent.json'),
        tasksDir: tempDir,
      })
      const result = await adapter.ping()

      expect(result.ok).toBe(false)
      expect(result.error).toContain('not found')
    })

    test('returns ok:false when tasks file is invalid JSON', async () => {
      const tasksFile = path.join(tempDir, 'invalid.json')
      fs.writeFileSync(tasksFile, 'not valid json {{{')

      const adapter = new JsonTaskAdapter({ type: 'json', tasksFile, tasksDir: tempDir })
      const result = await adapter.ping()

      expect(result.ok).toBe(false)
      expect(result.error).toBeDefined()
    })

    test('latencyMs is measured', async () => {
      const tasksFile = path.join(tempDir, 'tasks.json')
      fs.writeFileSync(tasksFile, JSON.stringify({ tasks: [] }))

      const adapter = new JsonTaskAdapter({ type: 'json', tasksFile, tasksDir: tempDir })
      const result = await adapter.ping()

      expect(typeof result.latencyMs).toBe('number')
      expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    })
  })

  describe('GitHubTaskAdapter ping', () => {
    test('has ping method', () => {
      const adapter = new GitHubTaskAdapter({ type: 'github' })
      expect(typeof adapter.ping).toBe('function')
    })

    test('returns result with ok, latencyMs, and optional error', async () => {
      const adapter = new GitHubTaskAdapter({ type: 'github' })
      const result = await adapter.ping()

      expect(typeof result.ok).toBe('boolean')
      expect(typeof result.latencyMs).toBe('number')
      // error is optional
    })
  })
})

describe('Error Scenarios', () => {
  describe('JsonTaskAdapter error handling', () => {
    let tempDir: string

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-error-test-'))
    })

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true })
    })

    test('handles corrupted JSON gracefully', async () => {
      const tasksFile = path.join(tempDir, 'tasks.json')
      fs.writeFileSync(tasksFile, '{ invalid json }}}')

      const adapter = new JsonTaskAdapter({ type: 'json', tasksFile, tasksDir: tempDir })

      // Should not throw, should return empty/null
      const tasks = await adapter.listPendingTasks()
      expect(tasks).toEqual([])

      const task = await adapter.findNextTask()
      expect(task).toBeNull()

      const count = await adapter.countPending()
      expect(count).toBe(0)
    })

    test('handles missing PRD file gracefully', async () => {
      const tasksFile = path.join(tempDir, 'tasks.json')
      fs.writeFileSync(tasksFile, JSON.stringify({
        tasks: [{ id: 'TASK-001-01', status: 'pending' }],
      }))
      // Note: PRD file TASK-001-01.md is NOT created

      const adapter = new JsonTaskAdapter({ type: 'json', tasksFile, tasksDir: tempDir })
      const task = await adapter.getTask('TASK-001-01')

      expect(task).not.toBeNull()
      expect(task!.id).toBe('TASK-001-01')
      expect(task!.description).toBe('') // Empty when PRD missing
    })

    test('handles update to non-existent task', async () => {
      const tasksFile = path.join(tempDir, 'tasks.json')
      fs.writeFileSync(tasksFile, JSON.stringify({ tasks: [] }))

      const adapter = new JsonTaskAdapter({ type: 'json', tasksFile, tasksDir: tempDir })
      const result = await adapter.markInProgress('TASK-999-99')

      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })

    test('file locking prevents concurrent writes', async () => {
      const tasksFile = path.join(tempDir, 'tasks.json')
      fs.writeFileSync(tasksFile, JSON.stringify({
        tasks: [
          { id: 'TASK-001-01', status: 'pending' },
          { id: 'TASK-001-02', status: 'pending' },
        ],
      }))

      const adapter = new JsonTaskAdapter({ type: 'json', tasksFile, tasksDir: tempDir })

      // Run multiple updates concurrently
      const results = await Promise.all([
        adapter.markInProgress('TASK-001-01'),
        adapter.markInProgress('TASK-001-02'),
      ])

      // Both should succeed (locking should serialize them)
      const successCount = results.filter(r => r.success).length
      expect(successCount).toBeGreaterThan(0)
    })
  })

  describe('GitHubTaskAdapter error handling', () => {
    test('returns error for invalid task ID', async () => {
      const adapter = new GitHubTaskAdapter({ type: 'github' })

      const result = await adapter.markInProgress('invalid-task-id')
      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid task ID')
    })

    test('extractIssueNumber handles various formats', () => {
      const adapter = new GitHubTaskAdapter({ type: 'github' })

      expect((adapter as any).extractIssueNumber('GH-123')).toBe(123)
      expect((adapter as any).extractIssueNumber('456')).toBe(456)
      expect((adapter as any).extractIssueNumber('invalid')).toBeNull()
      expect((adapter as any).extractIssueNumber('TASK-001-01')).toBeNull()
    })

    test('isRetryableError identifies retryable errors', () => {
      const adapter = new GitHubTaskAdapter({ type: 'github' })

      expect((adapter as any).isRetryableError({ message: 'network timeout' })).toBe(true)
      expect((adapter as any).isRetryableError({ message: 'ECONNRESET' })).toBe(true)
      expect((adapter as any).isRetryableError({ message: 'rate limit exceeded' })).toBe(true)
      expect((adapter as any).isRetryableError({ message: '502 Bad Gateway' })).toBe(true)
      expect((adapter as any).isRetryableError({ message: 'normal error' })).toBe(false)
    })
  })
})

describe('Sub-tasks and Dependencies', () => {
  describe('JsonTaskAdapter sub-tasks', () => {
    let tempDir: string
    let tasksFile: string
    let adapter: JsonTaskAdapter

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-subtask-test-'))
      tasksFile = path.join(tempDir, 'tasks.json')
      adapter = new JsonTaskAdapter({ type: 'json', tasksFile, tasksDir: tempDir })

      // Create tasks with sub-task relationships
      const tasksData = {
        tasks: [
          { id: 'TASK-001-01', status: 'pending', priority: 'high' },
          { id: 'TASK-001-01a', status: 'pending', priority: 'medium', parentId: 'TASK-001-01' },
          { id: 'TASK-001-01b', status: 'completed', priority: 'low', parentId: 'TASK-001-01' },
          { id: 'TASK-002-01', status: 'pending', priority: 'medium' },
        ],
      }
      fs.writeFileSync(tasksFile, JSON.stringify(tasksData, null, 2))
    })

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true })
    })

    test('getSubTasks returns sub-tasks of a parent', async () => {
      const subtasks = await adapter.getSubTasks('TASK-001-01')
      expect(subtasks.length).toBe(2)
      expect(subtasks.map(t => t.id).sort()).toEqual(['TASK-001-01a', 'TASK-001-01b'])
    })

    test('getSubTasks returns empty for task without sub-tasks', async () => {
      const subtasks = await adapter.getSubTasks('TASK-002-01')
      expect(subtasks).toEqual([])
    })

    test('listPendingTasks can filter by parentId', async () => {
      const tasks = await adapter.listPendingTasks({ parentId: 'TASK-001-01' })
      expect(tasks.length).toBe(1)
      expect(tasks[0].id).toBe('TASK-001-01a')
    })

    test('listPendingTasks can filter to top-level only', async () => {
      const tasks = await adapter.listPendingTasks({ topLevelOnly: true })
      expect(tasks.every(t => !t.parentId)).toBe(true)
      expect(tasks.length).toBe(2) // TASK-001-01 and TASK-002-01
    })

    test('createSubTask creates a sub-task', async () => {
      const subtask = await adapter.createSubTask!('TASK-002-01', {
        title: 'Sub-task title',
        description: 'Sub-task description',
        priority: 'high',
      })

      expect(subtask.parentId).toBe('TASK-002-01')
      expect(subtask.id).toBe('TASK-002-01a')
      expect(subtask.status).toBe('pending')

      // Verify it was saved
      const loaded = await adapter.getTask('TASK-002-01a')
      expect(loaded).not.toBeNull()
      expect(loaded!.parentId).toBe('TASK-002-01')
    })

    test('Task includes parentId when loaded', async () => {
      const task = await adapter.getTask('TASK-001-01a')
      expect(task).not.toBeNull()
      expect(task!.parentId).toBe('TASK-001-01')
    })
  })

  describe('JsonTaskAdapter dependencies', () => {
    let tempDir: string
    let tasksFile: string
    let adapter: JsonTaskAdapter

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-deps-test-'))
      tasksFile = path.join(tempDir, 'tasks.json')
      adapter = new JsonTaskAdapter({ type: 'json', tasksFile, tasksDir: tempDir })

      // Create tasks with dependencies
      const tasksData = {
        tasks: [
          { id: 'TASK-001-01', status: 'completed', priority: 'high' },
          { id: 'TASK-001-02', status: 'completed', priority: 'medium' },
          { id: 'TASK-002-01', status: 'pending', priority: 'high', dependsOn: ['TASK-001-01', 'TASK-001-02'] },
          { id: 'TASK-003-01', status: 'pending', priority: 'medium', dependsOn: ['TASK-001-01'] },
          { id: 'TASK-004-01', status: 'pending', priority: 'low' }, // No dependencies
        ],
      }
      fs.writeFileSync(tasksFile, JSON.stringify(tasksData, null, 2))
    })

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true })
    })

    test('getDependencies returns tasks this task depends on', async () => {
      const deps = await adapter.getDependencies('TASK-002-01')
      expect(deps.length).toBe(2)
      expect(deps.map(t => t.id).sort()).toEqual(['TASK-001-01', 'TASK-001-02'])
    })

    test('getDependencies returns empty for task without dependencies', async () => {
      const deps = await adapter.getDependencies('TASK-004-01')
      expect(deps).toEqual([])
    })

    test('getDependents returns tasks that depend on this task', async () => {
      const dependents = await adapter.getDependents('TASK-001-01')
      expect(dependents.length).toBe(2)
      expect(dependents.map(t => t.id).sort()).toEqual(['TASK-002-01', 'TASK-003-01'])
    })

    test('areDependenciesMet returns true when all deps completed', async () => {
      const met = await adapter.areDependenciesMet('TASK-002-01')
      expect(met).toBe(true)
    })

    test('areDependenciesMet returns false when deps not completed', async () => {
      // Update a dependency to pending
      const data = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'))
      const task = data.tasks.find((t: any) => t.id === 'TASK-001-01')
      task.status = 'pending'
      fs.writeFileSync(tasksFile, JSON.stringify(data, null, 2))

      const met = await adapter.areDependenciesMet('TASK-002-01')
      expect(met).toBe(false)
    })

    test('areDependenciesMet returns true for task without deps', async () => {
      const met = await adapter.areDependenciesMet('TASK-004-01')
      expect(met).toBe(true)
    })

    test('listPendingTasks excludes blocked tasks by default', async () => {
      // Set one dependency to pending so TASK-002-01 is blocked
      const data = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'))
      const task = data.tasks.find((t: any) => t.id === 'TASK-001-01')
      task.status = 'pending'
      fs.writeFileSync(tasksFile, JSON.stringify(data, null, 2))

      const tasks = await adapter.listPendingTasks()
      const ids = tasks.map(t => t.id)

      // TASK-002-01 has unmet dep (TASK-001-01 pending), TASK-003-01 also has unmet dep
      expect(ids).not.toContain('TASK-002-01')
      expect(ids).not.toContain('TASK-003-01')
      expect(ids).toContain('TASK-001-01') // Now pending
      expect(ids).toContain('TASK-004-01') // No deps
    })

    test('listPendingTasks includes blocked tasks when option set', async () => {
      // Set one dependency to pending so TASK-002-01 is blocked
      const data = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'))
      const task = data.tasks.find((t: any) => t.id === 'TASK-001-01')
      task.status = 'pending'
      fs.writeFileSync(tasksFile, JSON.stringify(data, null, 2))

      const tasks = await adapter.listPendingTasks({ includeBlocked: true })
      const ids = tasks.map(t => t.id)

      expect(ids).toContain('TASK-002-01') // Blocked but included
      expect(ids).toContain('TASK-003-01') // Blocked but included
    })

    test('addDependency adds a dependency', async () => {
      const result = await adapter.addDependency!('TASK-004-01', 'TASK-001-01')
      expect(result.success).toBe(true)

      const task = await adapter.getTask('TASK-004-01')
      expect(task!.dependsOn).toContain('TASK-001-01')
    })

    test('addDependency is idempotent', async () => {
      await adapter.addDependency!('TASK-004-01', 'TASK-001-01')
      const result = await adapter.addDependency!('TASK-004-01', 'TASK-001-01')
      expect(result.success).toBe(true)

      const task = await adapter.getTask('TASK-004-01')
      expect(task!.dependsOn?.filter(d => d === 'TASK-001-01').length).toBe(1)
    })

    test('removeDependency removes a dependency', async () => {
      const result = await adapter.removeDependency!('TASK-002-01', 'TASK-001-01')
      expect(result.success).toBe(true)

      const task = await adapter.getTask('TASK-002-01')
      expect(task!.dependsOn).not.toContain('TASK-001-01')
      expect(task!.dependsOn).toContain('TASK-001-02')
    })

    test('Task includes dependsOn when loaded', async () => {
      const task = await adapter.getTask('TASK-002-01')
      expect(task).not.toBeNull()
      expect(task!.dependsOn).toEqual(['TASK-001-01', 'TASK-001-02'])
    })
  })

  describe('GitHubTaskAdapter sub-tasks and dependencies', () => {
    let adapter: GitHubTaskAdapter

    beforeEach(() => {
      adapter = new GitHubTaskAdapter({ type: 'github' })
    })

    test('adaptIssue extracts parentId from body', () => {
      const issue = {
        number: 123,
        title: 'TASK-001-01a: Sub task',
        body: 'Parent: #100\n\nSub task description',
        state: 'open' as const,
        labels: [{ name: 'loopwork-task' }, { name: 'loopwork:sub-task' }],
        url: 'https://github.com/test/repo/issues/123',
      }

      const task = (adapter as any).adaptIssue(issue)
      expect(task.parentId).toBe('GH-100')
    })

    test('adaptIssue extracts dependsOn from body', () => {
      const issue = {
        number: 123,
        title: 'TASK-001-01: Main task',
        body: 'Depends on: #50, #51, #52\n\nTask description',
        state: 'open' as const,
        labels: [{ name: 'loopwork-task' }],
        url: 'https://github.com/test/repo/issues/123',
      }

      const task = (adapter as any).adaptIssue(issue)
      expect(task.dependsOn).toEqual(['GH-50', 'GH-51', 'GH-52'])
    })

    test('adaptIssue handles task ID format in dependencies', () => {
      const issue = {
        number: 123,
        title: 'TASK-001-01: Main task',
        body: 'Depends on: TASK-001-02, TASK-001-03\n\nTask description',
        state: 'open' as const,
        labels: [{ name: 'loopwork-task' }],
        url: 'https://github.com/test/repo/issues/123',
      }

      const task = (adapter as any).adaptIssue(issue)
      expect(task.dependsOn).toEqual(['TASK-001-02', 'TASK-001-03'])
    })

    test('has getSubTasks method', () => {
      expect(typeof adapter.getSubTasks).toBe('function')
    })

    test('has getDependencies method', () => {
      expect(typeof adapter.getDependencies).toBe('function')
    })

    test('has getDependents method', () => {
      expect(typeof adapter.getDependents).toBe('function')
    })

    test('has areDependenciesMet method', () => {
      expect(typeof adapter.areDependenciesMet).toBe('function')
    })

    test('has createSubTask method', () => {
      expect(typeof adapter.createSubTask).toBe('function')
    })

    test('has addDependency method', () => {
      expect(typeof adapter.addDependency).toBe('function')
    })

    test('has removeDependency method', () => {
      expect(typeof adapter.removeDependency).toBe('function')
    })

    test('extractIssueNumber handles #123 format', () => {
      expect((adapter as any).extractIssueNumber('#123')).toBe(123)
      expect((adapter as any).extractIssueNumber('#456')).toBe(456)
    })
  })

  describe('Task Interface with sub-tasks and dependencies', () => {
    test('Task supports parentId and dependsOn fields', () => {
      const task: Task = {
        id: 'TASK-001-01a',
        title: 'Sub task',
        description: 'Description',
        status: 'pending',
        priority: 'medium',
        parentId: 'TASK-001-01',
        dependsOn: ['TASK-001-00', 'TASK-001-00b'],
      }

      expect(task.parentId).toBe('TASK-001-01')
      expect(task.dependsOn).toEqual(['TASK-001-00', 'TASK-001-00b'])
    })

    test('Task parentId and dependsOn are optional', () => {
      const task: Task = {
        id: 'TASK-001-01',
        title: 'Regular task',
        description: 'Description',
        status: 'pending',
        priority: 'medium',
      }

      expect(task.parentId).toBeUndefined()
      expect(task.dependsOn).toBeUndefined()
    })
  })
})
