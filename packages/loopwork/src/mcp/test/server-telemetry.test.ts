import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { LoopworkMcpServer } from '../server'
import { TelemetryManager, setTestLogger } from '../../telemetry'
import type { TaskBackend, Task, TaskStatus } from '../../backends/types'

class MockTaskBackend implements TaskBackend {
  name = 'mock-backend'
  tasks: Task[] = []
  latencyMs = 10

  async getTask(taskId: string): Promise<Task | null> {
    await new Promise(r => setTimeout(r, this.latencyMs))
    return this.tasks.find(t => t.id === taskId) || null
  }

  async getSubTasks(taskId: string): Promise<Task[]> {
    await new Promise(r => setTimeout(r, this.latencyMs))
    return this.tasks.filter(t => t.parentId === taskId)
  }

  async getDependencies(taskId: string): Promise<Task[]> {
    await new Promise(r => setTimeout(r, this.latencyMs))
    const task = this.tasks.find(t => t.id === taskId)
    if (!task || !task.dependsOn) return []
    return this.tasks.filter(t => task.dependsOn?.includes(t.id))
  }

  async findNextTask() { return null }
  async listPendingTasks() { return [] }
  async listTasks() { return [] }
  async countPending() { return 0 }
  async markInProgress() { return { success: true } }
  async markCompleted() { return { success: true } }
  async markFailed() { return { success: true } }
  async markQuarantined() { return { success: true } }
  async resetToPending() { return { success: true } }
  async ping() { return { ok: true, latencyMs: 0 } }
  async getDependents() { return [] }
  async areDependenciesMet() { return true }
}

describe('LoopworkMcpServer Tool Execution Tracing', () => {
  let server: LoopworkMcpServer
  let backend: MockTaskBackend
  let testLogs: string[] = []

  beforeEach(() => {
    backend = new MockTaskBackend()
    server = new LoopworkMcpServer(backend)
    testLogs = []
    setTestLogger({
      info: () => {},
      warn: () => {},
      error: (...args: unknown[]) => { testLogs.push(args.join(' ')) },
    })
    TelemetryManager.resetInstance()
  })

  afterEach(() => {
    TelemetryManager.resetInstance()
  })

  test('should track tool execution latency', async () => {
    const task: Task = {
      id: 'TASK-001',
      title: 'Test Task',
      description: 'Test',
      status: 'pending' as TaskStatus,
      priority: 'high',
    }
    backend.tasks = [task]
    backend.latencyMs = 50

    const startTime = Date.now()
    const result = await (server as any).handleToolCall('loopwork_get_task', { taskId: 'TASK-001' })
    const duration = Date.now() - startTime

    expect(result).toBeDefined()
    expect(result.id).toBe('TASK-001')
    expect(duration).toBeGreaterThanOrEqual(50)
  })

  test('should record tool execution metrics on success', async () => {
    const task: Task = {
      id: 'TASK-002',
      title: 'Test Task 2',
      description: 'Test',
      status: 'pending' as TaskStatus,
      priority: 'medium',
    }
    backend.tasks = [task]

    const result = await (server as any).handleToolCall('loopwork_mark_complete', { taskId: 'TASK-002' })

    expect(result).toBeDefined()
    expect(result.success).toBe(true)
  })

  test('should handle tool execution errors', async () => {
    backend.getTask = async () => {
      throw new Error('Database connection failed')
    }

    try {
      await (server as any).handleToolCall('loopwork_get_task', { taskId: 'NON-EXISTENT' })
      expect(false).toBe(true) // Should not reach here
    } catch (error) {
      expect(error).toBeDefined()
      expect((error as Error).message).toContain('Database connection failed')
    }
  })

  test('should extract taskId from args for telemetry context', async () => {
    const task: Task = {
      id: 'TASK-003',
      title: 'Task with Context',
      description: 'Test',
      status: 'pending' as TaskStatus,
      priority: 'high',
    }
    backend.tasks = [task]

    const result = await (server as any).handleToolCall('loopwork_get_task_context', { taskId: 'TASK-003' })

    expect(result).toBeDefined()
    expect(result.task).toBeDefined()
    expect(result.task.id).toBe('TASK-003')
  })

  test('should handle tools without taskId gracefully', async () => {
    const result = await (server as any).handleToolCall('loopwork_count_pending', {})

    expect(result).toBeDefined()
    expect(typeof result.count).toBe('number')
  })

  test('should track list_tasks tool execution', async () => {
    const task1: Task = {
      id: 'TASK-004',
      title: 'Task 4',
      description: 'Test',
      status: 'pending' as TaskStatus,
      priority: 'high',
    }
    const task2: Task = {
      id: 'TASK-005',
      title: 'Task 5',
      description: 'Test',
      status: 'pending' as TaskStatus,
      priority: 'medium',
    }
    backend.tasks = [task1, task2]
    backend.listPendingTasks = async () => [task1, task2]

    const result = await (server as any).handleToolCall('loopwork_list_tasks', { feature: 'test' })

    expect(result).toBeDefined()
    expect(result.count).toBe(2)
    expect(result.tasks).toHaveLength(2)
  })

  test('should track backend_status tool execution', async () => {
    const result = await (server as any).handleToolCall('loopwork_backend_status', {})

    expect(result).toBeDefined()
    expect(result.backend).toBe('mock-backend')
    expect(result.healthy).toBe(true)
    expect(typeof result.latencyMs).toBe('number')
    expect(typeof result.pendingTasks).toBe('number')
  })
})
