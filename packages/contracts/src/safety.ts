/**
 * Safety Contracts
 *
 * These interfaces define safety checks, risk evaluation, and
 * interactive confirmation mechanisms for the Loopwork framework.
 */

/**
 * Risk levels for operations that may require safety precautions.
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

/**
 * Categories of operations that may have different risk profiles.
 */
export type OperationCategory =
  | 'file-system'
  | 'network'
  | 'process'
  | 'database'
  | 'git'
  | 'api-call'
  | 'configuration'
  | 'user-data'
  | 'unknown'

/**
 * Result of a risk evaluation.
 */
export interface RiskAssessment {
  /** The risk level assigned to the operation */
  level: RiskLevel

  /** Numeric risk score (0-100) for comparison */
  score: number

  /** Human-readable explanation of the risk */
  reason: string

  /** Specific concerns identified during assessment */
  concerns: string[]

  /** Whether this operation requires explicit confirmation */
  requiresConfirmation: boolean

  /** Recommended safety measures */
  recommendations: string[]
}

/**
 * Result of a safety shield check.
 */
export interface SafetyCheckResult {
  /** Whether the operation passed all safety checks */
  passed: boolean

  /** The operation that was checked */
  operation: string

  /** Category of the operation */
  category: OperationCategory

  /** Risk assessment if performed */
  riskAssessment?: RiskAssessment

  /** Any warnings issued during the check */
  warnings: string[]

  /** Any errors that blocked the operation */
  errors: string[]

  /** Timestamp of the check */
  timestamp: Date
}

/**
 * Safety shield interface for performing safety checks on operations.
 *
 * The safety shield is responsible for:
 * - Evaluating risk levels of proposed operations
 * - Performing safety checks before execution
 * - Blocking dangerous operations when appropriate
 */
export interface ISafetyShield {
  /**
   * Perform a safety check on a proposed operation.
   * @param operation Description of the operation to check
   * @param category Category of the operation
   * @returns Result of the safety check
   */
  check(operation: string, category: OperationCategory): Promise<SafetyCheckResult>

  /**
   * Evaluate the risk of an operation without blocking.
   * @param operation Description of the operation
   * @param category Category of the operation
   * @returns Risk assessment result
   */
  evaluateRisk(operation: string, category: OperationCategory): Promise<RiskAssessment>

  /**
   * Register a custom safety rule.
   * @param ruleId Unique identifier for the rule
   * @param condition Condition that triggers the rule
   * @param action Action to take when condition is met
   */
  registerRule(
    ruleId: string,
    condition: (operation: string, category: OperationCategory) => boolean,
    action: 'block' | 'warn' | 'log'
  ): void

  /**
   * Remove a registered safety rule.
   * @param ruleId Identifier of the rule to remove
   * @returns true if rule was found and removed
   */
  unregisterRule(ruleId: string): boolean

  /**
   * Check if an operation is allowed based on current safety state.
   * @param operation Description of the operation
   * @param category Category of the operation
   * @returns true if the operation is allowed
   */
  isOperationAllowed(operation: string, category: OperationCategory): Promise<boolean>

  /**
   * Get all active warnings from the safety shield.
   * @returns Array of warning messages
   */
  getWarnings(): string[]

  /**
   * Clear all accumulated warnings.
   */
  clearWarnings(): void
}

/**
 * Risk evaluator interface for assessing operation risk.
 *
 * Provides detailed risk analysis independent of safety actions.
 * Implementations can use different strategies for risk assessment.
 */
export interface IRiskEvaluator {
  /**
   * Evaluate the risk of performing an operation.
   * @param operation Description of the operation
   * @param category Category of the operation
   * @param context Additional context about the operation
   * @returns Detailed risk assessment
   */
  evaluate(
    operation: string,
    category: OperationCategory,
    context?: Record<string, unknown>
  ): Promise<RiskAssessment>

  /**
   * Get the risk level threshold for requiring confirmation.
   * @returns Risk level that triggers confirmation requirement
   */
  getConfirmationThreshold(): RiskLevel

  /**
   * Set the risk level threshold for requiring confirmation.
   * @param level New threshold level
   */
  setConfirmationThreshold(level: RiskLevel): void

  /**
   * Add a custom risk factor for evaluation.
   * @param factorName Name of the risk factor
   * @param evaluator Function that evaluates this factor
   */
  addRiskFactor(
    factorName: string,
    evaluator: (
      operation: string,
      category: OperationCategory,
      context?: Record<string, unknown>
    ) => number
  ): void

  /**
   * Remove a custom risk factor.
   * @param factorName Name of the risk factor to remove
   * @returns true if factor was found and removed
   */
  removeRiskFactor(factorName: string): boolean
}

/**
 * User confirmation state for interactive safety checks.
 */
export interface ConfirmationState {
  /** Unique identifier for this confirmation request */
  requestId: string

  /** The operation being confirmed */
  operation: string

  /** Category of the operation */
  category: OperationCategory

  /** Risk assessment for the operation */
  riskAssessment: RiskAssessment

  /** Current confirmation status */
  status: 'pending' | 'approved' | 'denied' | 'timeout'

  /** Timestamp when confirmation was requested */
  requestedAt: Date

  /** Timestamp when confirmation was received (if any) */
  respondedAt?: Date

  /** User or system that provided the response */
  responder?: string

  /** Optional reason provided with the response */
  reason?: string
}

/**
 * Interactive confirmation interface for handling user confirmations.
 *
 * Manages the flow of confirmation requests and responses.
 * Separated from ISafetyShield to allow different UI implementations.
 */
export interface IInteractiveConfirmation {
  /**
   * Request confirmation for an operation.
   * @param operation Description of the operation
   * @param category Category of the operation
   * @param riskAssessment Risk assessment result
   * @param timeout Timeout in milliseconds (default: 60000)
   * @returns Confirmation state with request ID
   */
  requestConfirmation(
    operation: string,
    category: OperationCategory,
    riskAssessment: RiskAssessment,
    timeout?: number
  ): Promise<ConfirmationState>

  /**
   * Approve a pending confirmation request.
   * @param requestId ID of the confirmation request
   * @param responder Identifier of the approver
   * @param reason Optional reason for approval
   * @returns Updated confirmation state
   */
  approve(requestId: string, responder?: string, reason?: string): Promise<ConfirmationState>

  /**
   * Deny a pending confirmation request.
   * @param requestId ID of the confirmation request
   * @param responder Identifier of the denier
   * @param reason Reason for denial
   * @returns Updated confirmation state
   */
  deny(requestId: string, responder?: string, reason?: string): Promise<ConfirmationState>

  /**
   * Get the current state of a confirmation request.
   * @param requestId ID of the confirmation request
   * @returns Confirmation state or null if not found
   */
  getState(requestId: string): Promise<ConfirmationState | null>

  /**
   * Get all pending confirmation requests.
   * @returns Array of pending confirmation states
   */
  getPendingRequests(): Promise<ConfirmationState[]>

  /**
   * Cancel a pending confirmation request.
   * @param requestId ID of the confirmation request
   * @returns true if request was found and cancelled
   */
  cancel(requestId: string): Promise<boolean>

  /**
   * Wait for a confirmation to be resolved.
   * @param requestId ID of the confirmation request
   * @param timeout Maximum time to wait in milliseconds
   * @returns Final confirmation state
   */
  waitForResolution(requestId: string, timeout?: number): Promise<ConfirmationState>

  /**
   * Check if auto-approval is enabled for certain risk levels.
   * @param level Risk level to check
   * @returns true if auto-approved at this level
   */
  isAutoApproved(level: RiskLevel): boolean

  /**
   * Set auto-approval for a specific risk level.
   * @param level Risk level to configure
   * @param autoApprove Whether to auto-approve at this level
   */
  setAutoApproval(level: RiskLevel, autoApprove: boolean): void
}
