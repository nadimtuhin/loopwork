import { describe, expect, test, mock, beforeEach } from 'bun:test'
import { LoopworkMcpServer } from '../server'
import type { TaskBackend, Task, TaskStatus } from '../../backends/types'

class MockTaskBackend implements TaskBackend {
  name = 'mock-backend'
  tasks: Task[] = []

  async getTask(taskId: string): Promise<Task | null> {
    return this.tasks.find(t => t.id === taskId) || null
  }

  async getSubTasks(taskId: string): Promise<Task[]> {
    return this.tasks.filter(t => t.parentId === taskId)
  }

  async getDependencies(taskId: string): Promise<Task[]> {
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

describe('LoopworkMcpServer', () => {
  let server: LoopworkMcpServer
  let backend: MockTaskBackend

  beforeEach(() => {
    backend = new MockTaskBackend()
    server = new LoopworkMcpServer(backend)
  })

  test('loopwork_get_task_context returns full context', async () => {
    const task: Task = {
      id: 'TASK-001',
      title: 'Test Task',
      description: 'Implement login feature. Requirements: secure password, email validation.',
      status: 'pending' as TaskStatus,
      priority: 'high',
      feature: 'auth'
    }
    
    const subtask: Task = {
      id: 'TASK-001a',
      title: 'Subtask 1',
      description: 'Subtask desc',
      status: 'pending' as TaskStatus,
      priority: 'medium',
      parentId: 'TASK-001'
    }

    const dependency: Task = {
      id: 'DEP-001',
      title: 'Dependency',
      description: 'Dep desc',
      status: 'completed' as TaskStatus,
      priority: 'high'
    }

    task.dependsOn = ['DEP-001']
    backend.tasks = [task, subtask, dependency]

    // Casting to any to access private method handleToolCall for testing purposes
    const result = await (server as any).handleToolCall('loopwork_get_task_context', { taskId: 'TASK-001' })

    expect(result).toBeDefined()
    expect(result.task).toBeDefined()
    expect(result.task.id).toBe('TASK-001')
    
    expect(result.subtasks).toBeDefined()
    expect(result.subtasks.length).toBe(1)
    expect(result.subtasks[0].id).toBe('TASK-001a')

    expect(result.dependencies).toBeDefined()
    expect(result.dependencies.length).toBe(1)
    expect(result.dependencies[0].id).toBe('DEP-001')

    expect(result.successCriteria).toBeDefined()
    expect(Array.isArray(result.successCriteria)).toBe(true)
    
    expect(result.failureCriteria).toBeDefined()
    expect(result.failureCriteria.some((c: string) => c.includes('Security vulnerabilities'))).toBe(true)
  })

  test('loopwork_get_task_context returns error for non-existent task', async () => {
    const result = await (server as any).handleToolCall('loopwork_get_task_context', { taskId: 'NON-EXISTENT' })
    expect(result.error).toBeDefined()
    expect(result.error).toContain('Task not found')
  })
})
