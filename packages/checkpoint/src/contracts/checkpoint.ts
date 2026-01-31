export interface AgentCheckpoint {
  agentId: string
  taskId: string
  agentName: string
  iteration: number
  timestamp: Date
  lastToolCall?: string
  phase: 'started' | 'executing' | 'completed' | 'failed' | 'interrupted'
  state?: Record<string, unknown>
}

export interface RestoredContext {
  checkpoint: AgentCheckpoint
  partialOutput: string
}

export type CheckpointEvent =
  | { type: 'execution_start'; taskId: string; agentName: string }
  | { type: 'tool_call'; toolName: string }
  | { type: 'iteration'; iteration: number }
  | { type: 'execution_end'; success: boolean }
  | { type: 'interrupt'; reason: string }
