/**
 * Safety System Contracts
 *
 * Types and interfaces for the safety validation system
 */

export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Risk assessment result for a task
 *
 * @example
 * {
 *   riskLevel: RiskLevel.HIGH,
 *   reasons: ['Modifies production database', 'No backup strategy'],
 *   confidence: 0.85
 * }
 */
export interface RiskAssessment {
  /** The assessed risk level */
  riskLevel: RiskLevel

  /** Reasons for the risk assessment */
  reasons: string[]

  /** Confidence score (0-1) for the assessment */
  confidence: number
}

/**
 * Interactive confirmation request
 *
 * @example
 * {
 *   taskId: 'TASK-001',
 *   title: 'Update production database',
 *   riskLevel: RiskLevel.HIGH,
 *   reasons: ['Modifies production database', 'No backup'],
 *   timeout: 30000
 * }
 */
export interface ConfirmationRequest {
  /** ID of the task requiring confirmation */
  taskId: string

  /** Task title for display */
  title: string

  /** Assessed risk level */
  riskLevel: RiskLevel

  /** Reasons for the risk assessment */
  reasons: string[]

  /** Timeout in milliseconds (default: 30000) */
  timeout?: number
}

/**
 * Result of an interactive confirmation
 */
export interface ConfirmationResult {
  /** Whether the user confirmed the action */
  confirmed: boolean

  /** Whether confirmation timed out */
  timedOut: boolean

  /** Whether running in non-interactive mode */
  nonInteractive: boolean
}

/**
 * Safety check hook context
 */
export interface SafetyCheckContext {
  /** The task being checked */
  task: {
    id: string
    title: string
    description?: string
    metadata?: Record<string, unknown>
  }

  /** Current namespace */
  namespace: string

  /** Whether running in non-interactive mode */
  nonInteractive: boolean
}

export interface SafetyConfig {
  enabled?: boolean
  maxRiskLevel?: RiskLevel
  autoReject?: boolean
  confirmTimeout?: number // Confirmation timeout in milliseconds
}

export const DEFAULT_SAFETY_CONFIG: SafetyConfig = {
  enabled: true,
  maxRiskLevel: RiskLevel.HIGH,
  autoReject: false,
  confirmTimeout: 30000
}
