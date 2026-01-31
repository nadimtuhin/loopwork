/**
 * Checkpoint Contract
 *
 * Types for checkpoint state management
 */

export interface Checkpoint {
  id: string
  taskId: string
  iteration: number
  timestamp: Date
  state: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface CheckpointConfig {
  enabled: boolean
  maxCheckpoints?: number
  storagePath?: string
  autoSave?: boolean
}
