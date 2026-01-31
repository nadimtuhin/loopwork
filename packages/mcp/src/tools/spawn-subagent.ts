/**
 * MCP Tool: spawn-subagent
 *
 * Spawns a subagent to work on a task with automatic checkpoint creation.
 */

import { createRegistry, createExecutor } from '@loopwork-ai/agents'
import { createCheckpointManager } from '@loopwork-ai/checkpoint'
import type { Task } from '@loopwork-ai/loopwork/contracts'
import type { IAgentRegistry, IAgentExecutor } from '@loopwork-ai/agents'
import type { ICheckpointManager } from '@loopwork-ai/checkpoint'
import { z } from 'zod'

export const SpawnSubagentInputSchema = z.object({
  agentName: z.string().describe('Name of registered agent to spawn'),
  taskId: z.string().describe('Unique task ID'),
  taskTitle: z.string().describe('Task title'),
  taskDescription: z.string().describe('Detailed task description'),
})

export type SpawnSubagentInput = z.infer<typeof SpawnSubagentInputSchema>

export interface SpawnSubagentOutput {
  agentId: string
  status: 'spawned' | 'error'
  message: string
}

export interface SpawnSubagentDeps {
  registry?: IAgentRegistry
  executor?: IAgentExecutor
  checkpointManager?: ICheckpointManager
}

/**
 * Spawn a subagent to execute a task
 */
export async function spawnSubagent(
  input: SpawnSubagentInput,
  deps?: SpawnSubagentDeps
): Promise<SpawnSubagentOutput> {
  try {
    // Validate input
    const validated = SpawnSubagentInputSchema.parse(input)

    // Initialize dependencies
    const registry = deps?.registry ?? createRegistry()
    const executor = deps?.executor ?? createExecutor()
    const checkpointManager = deps?.checkpointManager ?? createCheckpointManager()

    // Get agent from registry
    const agent = registry.get(validated.agentName)
    if (!agent) {
      return {
        agentId: '',
        status: 'error',
        message: `Agent not found: ${validated.agentName}`,
      }
    }

    // Create task object
    const task: Task = {
      id: validated.taskId,
      title: validated.taskTitle,
      description: validated.taskDescription,
      status: 'pending',
      priority: 'medium',
    }

    // Generate unique agent execution ID
    const agentId = `${validated.agentName}-${validated.taskId}-${Date.now()}`

    // Create initial checkpoint
    await checkpointManager.checkpoint(agentId, {
      agentId,
      taskId: validated.taskId,
      agentName: validated.agentName,
      iteration: 0,
      timestamp: new Date(),
      phase: 'started',
    })

    return {
      agentId,
      status: 'spawned',
      message: `Agent ${validated.agentName} spawned for task ${validated.taskId}`,
    }
  } catch (error) {
    return {
      agentId: '',
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * MCP tool definition for spawn-subagent
 */
export const spawnSubagentTool = {
  name: 'spawn-subagent',
  description: 'Spawn a subagent to work on a task with automatic checkpoint creation',
  inputSchema: SpawnSubagentInputSchema,
  handler: spawnSubagent,
}
