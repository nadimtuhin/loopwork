import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { createChaosPlugin } from '../src/index'
import type { TaskContext, Task } from '@loopwork-ai/loopwork/contracts'

describe('ChaosPlugin', () => {
  let mockTask: Task
  let mockContext: TaskContext

  beforeEach(() => {
    mockTask = {
      id: 'TASK-001',
      title: 'Test Task',
      status: 'pending',
      priority: 'medium',
    } as Task

    mockContext = {
      task: mockTask,
      iteration: 1,
      startTime: new Date(),
      namespace: 'default',
    } as TaskContext
  })

  test('should have the name chaos', () => {
    const plugin = createChaosPlugin()
    expect(plugin.name).toBe('chaos')
  })

  test('should not throw error when errorProbability is 0', async () => {
    const plugin = createChaosPlugin({ errorProbability: 0 })
    if (plugin.onTaskStart) {
      await expect(plugin.onTaskStart(mockContext)).resolves.toBeUndefined()
    }
  })

  test('should throw error when errorProbability is 1', async () => {
    const plugin = createChaosPlugin({ errorProbability: 1, errorMessage: 'Chaos failure' })
    if (plugin.onTaskStart) {
      await expect(plugin.onTaskStart(mockContext)).rejects.toThrow('Chaos failure')
    }
  })

  test('should inject delay when delayProbability is 1', async () => {
    const plugin = createChaosPlugin({ 
      delayProbability: 1, 
      minDelay: 10, 
      maxDelay: 10 
    })
    
    const start = Date.now()
    if (plugin.onTaskStart) {
      await plugin.onTaskStart(mockContext)
    }
    const duration = Date.now() - start
    
    expect(duration).toBeGreaterThanOrEqual(10)
  })
})
