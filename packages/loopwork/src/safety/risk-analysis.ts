/**
 * Risk Analysis Engine
 *
 * Assesses task risk levels based on task metadata and descriptions
 */

import type { RiskAssessment, SafetyCheckContext } from '../contracts'
import { RiskLevel } from '../contracts'

const DANGEROUS_KEYWORDS = [
  'delete',
  'remove',
  'drop',
  'truncate',
  'destroy',
  'rm -rf',
  'production',
  'migrate',
  'modify config'
]

const CRITICAL_KEYWORDS = [
  'rm -rf',
  'drop table',
  'truncate table',
  'delete all',
  'production database',
  'destroy'
]

/**
 * Analyzes task risk based on metadata and description
 */
export class RiskAnalysisEngine {
  /**
   * Assess risk level for a task
   */
  async assessRisk(context: SafetyCheckContext): Promise<RiskAssessment> {
    const { task } = context
    const { title, description = '', metadata = {} } = task

    const text = `${title} ${description} ${JSON.stringify(metadata)}`.toLowerCase()

    const reasons: string[] = []
    let riskLevel = RiskLevel.LOW

    // Check for critical keywords
    const criticalMatches = CRITICAL_KEYWORDS.filter(kw => text.includes(kw.toLowerCase()))
    if (criticalMatches.length > 0) {
      riskLevel = RiskLevel.CRITICAL
      reasons.push(`Contains critical keywords: ${criticalMatches.join(', ')}`)
    }

    // Check for dangerous keywords
    const dangerousMatches = DANGEROUS_KEYWORDS.filter(kw =>
      text.includes(kw.toLowerCase()) && !criticalMatches.includes(kw)
    )
    if (dangerousMatches.length > 0) {
      if (riskLevel !== RiskLevel.CRITICAL) {
        riskLevel = RiskLevel.HIGH
      }
      reasons.push(`Contains risky operations: ${dangerousMatches.join(', ')}`)
    }

    // Check for production-related work
    if (text.includes('production') || (metadata.environment === 'production')) {
      if (riskLevel === RiskLevel.LOW) {
        riskLevel = RiskLevel.MEDIUM
      }
      reasons.push('Modifies production environment')
    }

    // Check for database operations
    if (text.includes('database') || text.includes('db') || text.includes('schema')) {
      if (riskLevel === RiskLevel.LOW) {
        riskLevel = RiskLevel.MEDIUM
      }
      reasons.push('Database modification')
    }

    // If no risks found, keep LOW
    if (reasons.length === 0) {
      reasons.push('No significant risks detected')
    }

    return {
      riskLevel,
      reasons,
      confidence: 0.8
    }
  }

  /**
   * Check if risk level exceeds maximum allowed
   */
  exceedsMaxRisk(riskLevel: RiskLevel, maxRiskLevel: RiskLevel): boolean {
    const levels = [RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH, RiskLevel.CRITICAL]
    const riskIndex = levels.indexOf(riskLevel)
    const maxIndex = levels.indexOf(maxRiskLevel)

    return riskIndex > maxIndex
  }
}
