/**
 * UI Abstraction Layer for Interactive Confirmation
 *
 * This module provides a unified interface for user confirmations across
 * different platforms (CLI, Web, Telegram, etc.). Implementations can be
 * plugged in based on the execution context.
 */

/**
 * Confirmation UI types
 */
export type ConfirmationStatus = 'pending' | 'approved' | 'denied' | 'timeout' | 'cancelled'

/**
 * Platform-specific confirmation UI interface
 *
 * Implementations handle the actual user interaction for confirming
 * operations, providing a consistent abstraction across different platforms.
 */
export interface IConfirmationUI {
  /** UI type identifier */
  readonly type: 'cli' | 'web' | 'telegram' | 'discord' | 'custom'

  /** Check if this UI is available */
  readonly isAvailable: boolean

  /** Check if the UI is currently in a modal/prompt state */
  readonly isPrompting: boolean

  /**
   * Request user confirmation for an operation
   *
   * @param request Confirmation request details
   * @returns Promise resolving to confirmation result
   */
  confirm(request: ConfirmationRequest): Promise<ConfirmationResult>

  /**
   * Approve a pending confirmation (for programmatic use)
   *
   * @param requestId Request ID to approve
   * @param reason Optional reason for approval
   * @returns Whether the approval was successful
   */
  approve(requestId: string, reason?: string): Promise<boolean>

  /**
   * Deny a pending confirmation (for programmatic use)
   *
   * @param requestId Request ID to deny
   * @param reason Reason for denial
   * @returns Whether the denial was successful
   */
  deny(requestId: string, reason?: string): Promise<boolean>

  /**
   * Cancel the current confirmation prompt
   */
  cancel(): void
}

/**
 * Risk level with display properties
 */
export interface RiskInfo {
  level: RiskLevel
  emoji: string
  color: string
  label: string
  description: string
}

/**
 * Base risk levels
 */
export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Confirmation request with UI-specific context
 */
export interface ConfirmationRequest {
  /** Unique request ID */
  requestId: string

  /** Task ID if applicable */
  taskId?: string

  /** Title of the operation */
  title: string

  /** Risk level assessment */
  riskLevel: RiskLevel

  /** Detailed reasons for the risk assessment */
  reasons: string[]

  /** Timeout in milliseconds */
  timeout?: number

  /** Optional custom title */
  customTitle?: string

  /** Optional custom message */
  customMessage?: string

  /** Show confirm/deny buttons */
  showButtons?: boolean

  /** Show detailed information */
  showDetails?: boolean
}

/**
 * Confirmation result from UI
 */
export interface ConfirmationResult {
  /** Whether the user confirmed the operation */
  confirmed: boolean

  /** Whether confirmation timed out */
  timedOut: boolean

  /** Whether running in non-interactive mode */
  nonInteractive: boolean

  /** Reason for the result (if applicable) */
  reason?: string

  /** Request ID */
  requestId: string
}

/**
 * UI implementation options
 */
export interface UIOptions {
  /** Auto-confirm in non-interactive mode */
  autoConfirmNonInteractive?: boolean

  /** Auto-confirm in CI environment */
  autoConfirmCI?: boolean

  /** Show debug output */
  debug?: boolean

  /** Custom message prefix */
  prefix?: string
}

/**
 * Risk level metadata for UI display
 */
export const RISK_INFO: Record<RiskLevel, RiskInfo> = {
  [RiskLevel.LOW]: {
    level: RiskLevel.LOW,
    emoji: '🟢',
    color: '\x1b[32m', // green
    label: 'LOW',
    description: 'Low risk operation'
  },
  [RiskLevel.MEDIUM]: {
    level: RiskLevel.MEDIUM,
    emoji: '🟡',
    color: '\x1b[33m', // yellow
    label: 'MEDIUM',
    description: 'Medium risk operation'
  },
  [RiskLevel.HIGH]: {
    level: RiskLevel.HIGH,
    emoji: '🟠',
    color: '\x1b[93m', // bright yellow
    label: 'HIGH',
    description: 'High risk operation'
  },
  [RiskLevel.CRITICAL]: {
    level: RiskLevel.CRITICAL,
    emoji: '🔴',
    color: '\x1b[91m', // red
    label: 'CRITICAL',
    description: 'Critical risk operation'
  }
}

/**
 * Factory function to create appropriate UI based on context
 *
 * @param options UI options
 * @returns UI implementation instance
 */
export function createConfirmationUI(options: UIOptions = {}): IConfirmationUI {
  const { debug = false } = options

  // Determine platform based on environment
  const isTTY = process.stdin.isTTY && process.stdout.isTTY
  const isCI = process.env.CI === 'true'

  if (debug) {
    console.log('[ConfirmationUI] Platform detection:', {
      isTTY,
      isCI,
      autoConfirmNonInteractive: options.autoConfirmNonInteractive,
      autoConfirmCI: options.autoConfirmCI
    })
  }

  // Use CLI UI if in TTY or forced, otherwise use web/UI fallback
  if (isTTY) {
    return new CLIConfirmationUI(options)
  }

  // For non-TTY environments, provide a basic implementation
  // This could be extended with web UI or other implementations
  return new BasicConfirmationUI(options)
}
