import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import fs from 'fs'
import path from 'path'
import os from 'os'
// Removed type-only import from '../../src/backends'
import { LoopworkError } from '../../src/core/errors'
import type { Config } from '../../src/core/config'
import type { TaskBackend } from '../../src/contracts/backend'
import { list, retry, clear, type DeadletterDependencies } from '../../src/commands/deadletter'

describe('Deadletter Functionality', () => {
  let tempDir: string
  let tempTasksFile: string
  let adapter: JsonTaskAdapter

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deadletter-test-'))
    tempTasksFile = path.join(tempDir, 'tasks.json')
    adapter = new JsonTaskAdapter({
      type: 'json',
      tasksFile: tempTasksFile,
      tasksDir: tempDir,
    })
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  function createMockDeps() {
    return {
      getConfig: mock(async (): Promise<any> => ({
        cli: 'claude',
        maxIterations: 50,
        timeout: 600,
        namespace: 'default',
        backend: { type: 'json', tasksFile: tempTasksFile },
      })),
      createBackend: mock((backendConfig: any): any => adapter),
      logger: {
        info: mock(() => {}),
        success: mock(() => {}),
        warn: mock(() => {}),
        error: mock(() => {}),
        raw: mock(() => {}),
      },
    }
  }

  describe('list', () => {
    test('shows no quarantined tasks message when none exist', async () => {
      const tasksData = {
        tasks: [
          { id: 'TASK-001', status: 'pending', priority: 'high' },
          { id: 'TASK-002', status: 'completed', priority: 'medium' },
        ],
      }
      fs.writeFileSync(tempTasksFile, JSON.stringify(tasksData, null, 2))

      const deps = createMockDeps()
      await list({}, deps)

      expect(deps.logger.info).toHaveBeenCalledWith('No quarantined tasks found.')
    })

    test('lists quarantined tasks with correct formatting', async () => {
      const tasksData = {
        tasks: [
          {
            id: 'TASK-001',
            status: 'quarantined',
            priority: 'high',
            feature: 'auth',
            events: [
              {
                taskId: 'TASK-001',
                timestamp: '2025-01-15T10:00:00.000Z',
                type: 'quarantined',
                message: 'Exceeded quarantine threshold (3). Last error: Task failed repeatedly',
                level: 'error',
                actor: 'system',
              },
            ],
          },
          {
            id: 'TASK-002',
            status: 'quarantined',
            priority: 'low',
            feature: 'docs',
            events: [
              {
                taskId: 'TASK-002',
                timestamp: '2025-01-16T11:00:00.000Z',
                type: 'quarantined',
                message: 'Network error',
                level: 'error',
                actor: 'system',
              },
            ],
          },
        ],
      }
      fs.writeFileSync(tempTasksFile, JSON.stringify(tasksData, null, 2))

      const deps = createMockDeps()
      await list({}, deps)

      expect(deps.logger.info).toHaveBeenCalledWith(expect.stringContaining('Dead Letter Queue'))
      expect(deps.logger.raw).toHaveBeenCalled()
    })

    test('outputs as JSON when json option is true', async () => {
      const tasksData = {
        tasks: [
          {
            id: 'TASK-001',
            status: 'quarantined',
            priority: 'high',
            feature: 'auth',
            events: [
              {
                taskId: 'TASK-001',
                timestamp: '2025-01-15T10:00:00.000Z',
                type: 'quarantined',
                message: 'Exceeded quarantine threshold',
                level: 'error',
                actor: 'system',
              },
            ],
          },
        ],
      }
      fs.writeFileSync(tempTasksFile, JSON.stringify(tasksData, null, 2))

      const deps = createMockDeps()
      await list({ json: true }, deps)

      expect(deps.logger.raw).toHaveBeenCalledWith(expect.stringContaining('TASK-001'))
    })

    test('shows only quarantined tasks when mixed statuses exist', async () => {
      const tasksData = {
        tasks: [
          { id: 'TASK-001', status: 'pending', priority: 'high' },
          { id: 'TASK-002', status: 'quarantined', priority: 'medium', feature: 'api' },
          { id: 'TASK-003', status: 'completed', priority: 'low' },
          { id: 'TASK-004', status: 'in-progress', priority: 'high' },
          { id: 'TASK-005', status: 'quarantined', priority: 'high', feature: 'auth' },
        ],
      }
      fs.writeFileSync(tempTasksFile, JSON.stringify(tasksData, null, 2))

      const deps = createMockDeps()
      await list({}, deps)

      // Should show dead letter queue header
      expect(deps.logger.info).toHaveBeenCalledWith(expect.stringContaining('Dead Letter Queue'))
      // Should show quarantined tasks count
      expect(deps.logger.info).toHaveBeenCalledWith(expect.stringContaining('2 quarantined tasks'))
    })
  })

  describe('retry', () => {
    test('throws error when task does not exist', async () => {
      const tasksData = {
        tasks: [
          { id: 'TASK-001', status: 'pending', priority: 'high' },
        ],
      }
      fs.writeFileSync(tempTasksFile, JSON.stringify(tasksData, null, 2))

      const deps = createMockDeps()
      await expect(retry('NONEXISTENT', deps)).rejects.toThrow(LoopworkError)
      await expect(retry('NONEXISTENT', deps)).rejects.toMatchObject({
        code: 'ERR_TASK_NOT_FOUND',
      })
    })

    test('throws error when task is not quarantined', async () => {
      const tasksData = {
        tasks: [
          { id: 'TASK-001', status: 'pending', priority: 'high' },
        ],
      }
      fs.writeFileSync(tempTasksFile, JSON.stringify(tasksData, null, 2))

      const deps = createMockDeps()
      await expect(retry('TASK-001', deps)).rejects.toThrow(LoopworkError)
      await expect(retry('TASK-001', deps)).rejects.toMatchObject({
        code: 'ERR_TASK_INVALID',
      })
    })

    test('throws error when task is already completed', async () => {
      const tasksData = {
        tasks: [
          { id: 'TASK-001', status: 'completed', priority: 'high' },
        ],
      }
      fs.writeFileSync(tempTasksFile, JSON.stringify(tasksData, null, 2))

      const deps = createMockDeps()
      await expect(retry('TASK-001', deps)).rejects.toThrow(LoopworkError)
    })

    test('throws error when task is failed (not quarantined)', async () => {
      const tasksData = {
        tasks: [
          {
            id: 'TASK-001',
            status: 'failed',
            priority: 'high',
            timestamps: { failedAt: '2025-01-15T10:00:00.000Z' },
          },
        ],
      }
      fs.writeFileSync(tempTasksFile, JSON.stringify(tasksData, null, 2))

      const deps = createMockDeps()
      await expect(retry('TASK-001', deps)).rejects.toThrow(LoopworkError)
    })

    test('successfully retries quarantined task', async () => {
      const tasksData = {
        tasks: [
          {
            id: 'TASK-001',
            status: 'quarantined',
            priority: 'high',
            feature: 'auth',
            timestamps: {
              createdAt: '2025-01-01T10:00:00.000Z',
              updatedAt: '2025-01-15T10:00:00.000Z',
              quarantinedAt: '2025-01-15T10:00:00.000Z',
            },
            events: [
              {
                taskId: 'TASK-001',
                timestamp: '2025-01-15T10:00:00.000Z',
                type: 'quarantined',
                message: 'Exceeded quarantine threshold',
                level: 'error',
                actor: 'system',
              },
            ],
          },
        ],
      }
      fs.writeFileSync(tempTasksFile, JSON.stringify(tasksData, null, 2))

      const deps = createMockDeps()
      await retry('TASK-001', deps)

      expect(deps.logger.success).toHaveBeenCalledWith(expect.stringContaining('moved back to pending queue'))

      // Verify task is now pending
      const data = JSON.parse(fs.readFileSync(tempTasksFile, 'utf-8'))
      expect(data.tasks[0].status).toBe('pending')
    })

    test('clears quarantined timestamp when retrying', async () => {
      const tasksData = {
        tasks: [
          {
            id: 'TASK-001',
            status: 'quarantined',
            priority: 'high',
            timestamps: {
              createdAt: '2025-01-01T10:00:00.000Z',
              updatedAt: '2025-01-15T10:00:00.000Z',
              quarantinedAt: '2025-01-15T10:00:00.000Z',
            },
          },
        ],
      }
      fs.writeFileSync(tempTasksFile, JSON.stringify(tasksData, null, 2))

      const deps = createMockDeps()
      await retry('TASK-001', deps)

      const data = JSON.parse(fs.readFileSync(tempTasksFile, 'utf-8'))
      expect(data.tasks[0].timestamps?.quarantinedAt).toBeUndefined()
    })

    test('adds reset event to task history', async () => {
      const tasksData = {
        tasks: [
          {
            id: 'TASK-001',
            status: 'quarantined',
            priority: 'high',
            events: [
              {
                taskId: 'TASK-001',
                timestamp: '2025-01-15T10:00:00.000Z',
                type: 'quarantined',
                message: 'Exceeded quarantine threshold',
                level: 'error',
                actor: 'system',
              },
            ],
          },
        ],
      }
      fs.writeFileSync(tempTasksFile, JSON.stringify(tasksData, null, 2))

      const deps = createMockDeps()
      await retry('TASK-001', deps)

      const data = JSON.parse(fs.readFileSync(tempTasksFile, 'utf-8'))
      const resetEvent = data.tasks[0].events.find((e: { type: string }) => e.type === 'reset')
      expect(resetEvent).toBeDefined()
      expect(resetEvent.message).toContain('quarantined')
      expect(resetEvent.message).toContain('pending')
    })
  })

  describe('clear', () => {
    test('throws error when task does not exist', async () => {
      const tasksData = {
        tasks: [
          { id: 'TASK-001', status: 'pending', priority: 'high' },
        ],
      }
      fs.writeFileSync(tempTasksFile, JSON.stringify(tasksData, null, 2))

      const deps = createMockDeps()
      await expect(clear('NONEXISTENT', deps)).rejects.toThrow(LoopworkError)
      await expect(clear('NONEXISTENT', deps)).rejects.toMatchObject({
        code: 'ERR_TASK_NOT_FOUND',
      })
    })

    test('throws error when task is not quarantined', async () => {
      const tasksData = {
        tasks: [
          { id: 'TASK-001', status: 'pending', priority: 'high' },
        ],
      }
      fs.writeFileSync(tempTasksFile, JSON.stringify(tasksData, null, 2))

      const deps = createMockDeps()
      await expect(clear('TASK-001', deps)).rejects.toThrow(LoopworkError)
    })

    test('successfully clears quarantined task', async () => {
      const tasksData = {
        tasks: [
          {
            id: 'TASK-001',
            status: 'quarantined',
            priority: 'high',
            feature: 'auth',
            timestamps: {
              createdAt: '2025-01-01T10:00:00.000Z',
              updatedAt: '2025-01-15T10:00:00.000Z',
              quarantinedAt: '2025-01-15T10:00:00.000Z',
            },
            events: [
              {
                taskId: 'TASK-001',
                timestamp: '2025-01-15T10:00:00.000Z',
                type: 'quarantined',
                message: 'Exceeded quarantine threshold',
                level: 'error',
                actor: 'system',
              },
            ],
          },
        ],
      }
      fs.writeFileSync(tempTasksFile, JSON.stringify(tasksData, null, 2))

      const deps = createMockDeps()
      await clear('TASK-001', deps)

      expect(deps.logger.success).toHaveBeenCalledWith(expect.stringContaining('marked as failed'))

      // Verify task is now failed
      const data = JSON.parse(fs.readFileSync(tempTasksFile, 'utf-8'))
      expect(data.tasks[0].status).toBe('failed')
    })

    test('adds failed event with clear message', async () => {
      const tasksData = {
        tasks: [
          {
            id: 'TASK-001',
            status: 'quarantined',
            priority: 'high',
            events: [
              {
                taskId: 'TASK-001',
                timestamp: '2025-01-15T10:00:00.000Z',
                type: 'quarantined',
                message: 'Exceeded quarantine threshold',
                level: 'error',
                actor: 'system',
              },
            ],
          },
        ],
      }
      fs.writeFileSync(tempTasksFile, JSON.stringify(tasksData, null, 2))

      const deps = createMockDeps()
      await clear('TASK-001', deps)

      const data = JSON.parse(fs.readFileSync(tempTasksFile, 'utf-8'))
      const failedEvent = data.tasks[0].events.find((e: { type: string }) => e.type === 'failed')
      expect(failedEvent).toBeDefined()
      expect(failedEvent.message).toContain('dead letter queue')
    })

    test('sets failedAt timestamp when clearing', async () => {
      const tasksData = {
        tasks: [
          {
            id: 'TASK-001',
            status: 'quarantined',
            priority: 'high',
            timestamps: {
              createdAt: '2025-01-01T10:00:00.000Z',
              updatedAt: '2025-01-15T10:00:00.000Z',
              quarantinedAt: '2025-01-15T10:00:00.000Z',
            },
          },
        ],
      }
      fs.writeFileSync(tempTasksFile, JSON.stringify(tasksData, null, 2))

      const deps = createMockDeps()
      await clear('TASK-001', deps)

      const data = JSON.parse(fs.readFileSync(tempTasksFile, 'utf-8'))
      expect(data.tasks[0].timestamps?.failedAt).toBeDefined()
      expect(data.tasks[0].timestamps?.failedAt).not.toBeNull()
    })

    test('increments failure count when clearing', async () => {
      const tasksData = {
        tasks: [
          {
            id: 'TASK-001',
            status: 'quarantined',
            priority: 'high',
            failureCount: 2,
          },
        ],
      }
      fs.writeFileSync(tempTasksFile, JSON.stringify(tasksData, null, 2))

      const deps = createMockDeps()
      await clear('TASK-001', deps)

      const data = JSON.parse(fs.readFileSync(tempTasksFile, 'utf-8'))
      expect(data.tasks[0].failureCount).toBe(3)
    })
  })

  describe('GitHubTaskAdapter', () => {
    let githubAdapter: GitHubTaskAdapter

    beforeEach(() => {
      githubAdapter = new GitHubTaskAdapter({ type: 'github', repo: 'test/repo' })
    })

    test('list returns empty array when no quarantined tasks', async () => {
      const tasks = await githubAdapter.listTasks({ status: 'quarantined' })
      expect(tasks).toEqual([])
    })

    test('resetToPending returns error for non-existent task', async () => {
      const result = await githubAdapter.resetToPending('NONEXISTENT')
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    test('markFailed returns error for non-existent task', async () => {
      const result = await githubAdapter.markFailed('NONEXISTENT', 'test error')
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })
})
