/**
 * MCP Tool: resume-agent
 *
 * Resumes an interrupted agent by loading its checkpoint.
 */

import { createCheckpointManager } from '@loopwork-ai/checkpoint'
import type { ICheckpointManager, AgentCheckpoint } from '@loopwork-ai/checkpoint'
import { z } from 'zod'

export const ResumeAgentInputSchema = z.object({
  agentId: z.string().describe('Agent execution ID to resume'),
})

export type ResumeAgentInput = z.infer<typeof ResumeAgentInputSchema>

export interface ResumeAgentOutput {
  status: 'resumed' | 'not_found' | 'completed'
  checkpoint?: AgentCheckpoint
  message: string
}

export interface ResumeAgentDeps {
  checkpointManager?: ICheckpointManager
}

/**
 * Resume an interrupted agent
 */
export async function resumeAgent(
  input: ResumeAgentInput,
  deps?: ResumeAgentDeps
): Promise<ResumeAgentOutput> {
  try {
    // Validate input
    const validated = ResumeAgentInputSchema.parse(input)

    // Initialize checkpoint manager
    const checkpointManager = deps?.checkpointManager ?? createCheckpointManager()

    // Try to restore checkpoint
    const restored = await checkpointManager.restore(validated.agentId)

    if (!restored) {
      return {
        status: 'not_found',
        message: `No checkpoint found for agent: ${validated.agentId}`,
      }
    }

    // Check if already completed
    if (restored.checkpoint.phase === 'completed') {
      return {
        status: 'completed',
        checkpoint: restored.checkpoint,
        message: `Agent ${validated.agentId} already completed`,
      }
    }

    return {
      status: 'resumed',
      checkpoint: restored.checkpoint,
      message: `Restored checkpoint for agent ${validated.agentId} at iteration ${restored.checkpoint.iteration}`,
    }
  } catch (error) {
    return {
      status: 'not_found',
      message: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * MCP tool definition for resume-agent
 */
export const resumeAgentTool = {
  name: 'resume-agent',
  description: 'Resume an interrupted agent by loading its checkpoint',
  inputSchema: ResumeAgentInputSchema,
  handler: resumeAgent,
}
