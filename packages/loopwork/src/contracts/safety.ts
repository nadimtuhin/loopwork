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

export interface SafetyConfig {
  enabled?: boolean
  maxRiskLevel?: RiskLevel
  autoReject?: boolean
}

export const DEFAULT_SAFETY_CONFIG: SafetyConfig = {
  enabled: true,
  maxRiskLevel: RiskLevel.HIGH,
  autoReject: false
}
