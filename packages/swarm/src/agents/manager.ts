import type { Task, TaskResult, SwarmAgent } from '../coordinator'
import type { AgentPersona } from '../schemas/persona'

export const ManagerPersona: AgentPersona = {
  name: 'Manager',
  description: 'Expert project manager that coordinates complex tasks by delegating to specialized workers',
  prompt: `You are an expert project manager. Your goal is to take high-level objectives,
analyze them, and break them down into smaller, actionable sub-tasks that can be
executed by specialized agents.`,
  capabilities: ['delegate', 'coordinate', 'analyze'],
  role: 'manager',
}

export class ManagerAgent implements SwarmAgent {
  id = 'manager'
  persona = ManagerPersona

  async execute(task: Task): Promise<TaskResult> {
    const startTime = Date.now()

    try {
      if (task.type !== 'delegate') {
        return {
          taskId: task.id,
          success: false,
          output: '',
          filesCreated: [],
          error: `Manager agent can only handle 'delegate' tasks, got: ${task.type}`,
        }
      }

      const subTasks: Task[] = []
      const output = `Manager analyzing task: ${task.id}`

      if (task.context?.type === 'package-test' && Array.isArray(task.context.packages)) {
        const packages = task.context.packages as string[]
        for (const pkg of packages) {
          subTasks.push({
            id: `${task.id}-${pkg}-tests`,
            type: 'generate-tests',
            target: pkg,
            priority: task.priority - 1,
            context: { parentTaskId: task.id }
          })
        }
      }

      return {
        taskId: task.id,
        success: true,
        output: `${output}. Delegated ${subTasks.length} sub-tasks.`,
        filesCreated: [],
        subTasks: subTasks.length > 0 ? subTasks : undefined,
      }
    } catch (error) {
      return {
        taskId: task.id,
        success: false,
        output: '',
        filesCreated: [],
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}

export function createManagerAgent(): ManagerAgent {
  return new ManagerAgent()
}
