import { describe, expect, test } from 'bun:test'
import { SwarmCoordinator, type SwarmAgent, type Task, type TaskResult } from '../coordinator'
import { ManagerAgent } from '../agents/manager'

describe('SwarmCoordinator Delegation', () => {
  test('should handle task delegation between manager and workers', async () => {
    const coordinator = new SwarmCoordinator({ maxConcurrency: 2 })
    
    const workerAgent: SwarmAgent = {
      id: 'worker',
      persona: {
        name: 'Worker',
        description: 'Test worker',
        prompt: 'Work',
        capabilities: ['generate-tests']
      },
      execute: async (task: Task): Promise<TaskResult> => {
        return {
          taskId: task.id,
          success: true,
          output: `Worker finished ${task.id}`,
          filesCreated: [`${task.target}.test.ts`]
        }
      }
    }

    const managerAgent = new ManagerAgent()
    
    coordinator.registerAgent(managerAgent)
    coordinator.registerAgent(workerAgent)

    coordinator.addTask({
      id: 'top-level-task',
      type: 'delegate',
      target: 'root',
      priority: 10,
      context: {
        type: 'package-test',
        packages: ['auth', 'core']
      }
    })

    const results = await coordinator.run()

    expect(results.length).toBe(3)
    
    const managerResult = results.find(r => r.taskId === 'top-level-task')
    expect(managerResult).toBeDefined()
    expect(managerResult?.success).toBe(true)
    expect(managerResult?.subTasks?.length).toBe(2)

    const workerResults = results.filter(r => r.taskId.includes('-tests'))
    expect(workerResults.length).toBe(2)
    expect(workerResults.every(r => r.success)).toBe(true)
  })

  test('should respect priorities in delegated tasks', async () => {
    const coordinator = new SwarmCoordinator({ maxConcurrency: 1 })
    const executionOrder: string[] = []

    const fastAgent: SwarmAgent = {
      id: 'fast',
      persona: { name: 'Fast', description: 'Fast', prompt: 'Fast', capabilities: ['generate-tests', 'delegate'] },
      execute: async (task: Task): Promise<TaskResult> => {
        executionOrder.push(task.id)
        if (task.type === 'delegate') {
          return {
            taskId: task.id,
            success: true,
            output: 'Delegating',
            filesCreated: [],
            subTasks: [
              { id: 'sub-1', type: 'generate-tests', target: 't1', priority: 100 },
              { id: 'sub-2', type: 'generate-tests', target: 't2', priority: 50 }
            ]
          }
        }
        return { taskId: task.id, success: true, output: 'Done', filesCreated: [] }
      }
    }

    coordinator.registerAgent(fastAgent)
    coordinator.addTask({ id: 'main', type: 'delegate', target: 'root', priority: 10 })
    
    await coordinator.run()

    expect(executionOrder).toEqual(['main', 'sub-1', 'sub-2'])
  })
})
