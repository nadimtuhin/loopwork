import { IRiskEvaluator, RiskLevel, OperationCategory, RiskAssessment } from '@loopwork-ai/contracts'

const DANGEROUS_KEYWORDS = [
  'delete',
  'remove',
  'drop',
  'truncate',
  'destroy',
  'rm -rf',
  'migrate'
]

const CRITICAL_KEYWORDS = [
  'rm -rf',
  'drop table',
  'truncate table',
  'delete all',
  'production database',
  'destroy'
]

export class RiskEvaluator implements IRiskEvaluator {
  private confirmationThreshold: RiskLevel = 'high'
  private riskFactors: Map<string, (operation: string, category: OperationCategory, context?: Record<string, unknown>) => number> = new Map()

  async evaluate(
    operation: string,
    category: OperationCategory,
    context?: Record<string, unknown>
  ): Promise<RiskAssessment> {
    const text = `${operation} ${JSON.stringify(context || {})}`.toLowerCase()
    const concerns: string[] = []
    let level: RiskLevel = 'low'
    let score = 0

    const criticalMatches = CRITICAL_KEYWORDS.filter(kw => text.includes(kw.toLowerCase()))
    if (criticalMatches.length > 0) {
      level = 'critical'
      score = 90
      concerns.push(`Contains critical keywords: ${criticalMatches.join(', ')}`)
    }

    const dangerousMatches = DANGEROUS_KEYWORDS.filter(kw =>
      text.includes(kw.toLowerCase()) && !criticalMatches.includes(kw)
    )
    if (dangerousMatches.length > 0) {
      if (level !== 'critical') {
        level = 'high'
        score = Math.max(score, 70)
      }
      concerns.push(`Contains risky operations: ${dangerousMatches.join(', ')}`)
    }

    if (text.includes('production') || (context?.environment === 'production')) {
      if (level === 'low') {
        level = 'medium'
        score = Math.max(score, 40)
      }
      concerns.push('Modifies production environment')
    }

    if (category === 'database' || text.includes('database') || text.includes('db') || text.includes('schema')) {
      if (level === 'low') {
        level = 'medium'
        score = Math.max(score, 40)
      }
      concerns.push('Database modification')
    }

    for (const [name, evaluator] of this.riskFactors) {
      const factorScore = evaluator(operation, category, context)
      if (factorScore > 0) {
        score += factorScore
        concerns.push(`Risk factor identified: ${name}`)
      }
    }

    score = Math.min(score, 100)

    if (level === 'low' || level === 'medium') {
      if (score >= 70) level = 'high'
      else if (score >= 40) level = 'medium'
    }

    const requiresConfirmation = this.exceedsThreshold(level, this.confirmationThreshold)

    return {
      level,
      score,
      reason: concerns.length > 0 ? concerns[0] : 'No significant risks detected',
      concerns,
      requiresConfirmation,
      recommendations: this.getRecommendations(level, concerns)
    }
  }

  getConfirmationThreshold(): RiskLevel {
    return this.confirmationThreshold
  }

  setConfirmationThreshold(level: RiskLevel): void {
    this.confirmationThreshold = level
  }

  addRiskFactor(
    factorName: string,
    evaluator: (operation: string, category: OperationCategory, context?: Record<string, unknown>) => number
  ): void {
    this.riskFactors.set(factorName, evaluator)
  }

  removeRiskFactor(factorName: string): boolean {
    return this.riskFactors.delete(factorName)
  }

  private exceedsThreshold(level: RiskLevel, threshold: RiskLevel): boolean {
    const levels: RiskLevel[] = ['low', 'medium', 'high', 'critical']
    return levels.indexOf(level) >= levels.indexOf(threshold)
  }

  private getRecommendations(level: RiskLevel, concerns: string[]): string[] {
    const recommendations: string[] = []
    if (level === 'critical' || level === 'high') {
      recommendations.push('Review the operation carefully before proceeding')
      recommendations.push('Ensure you have a recent backup')
    }
    if (concerns.some(c => c.includes('production'))) {
      recommendations.push('Run on a staging environment first')
    }
    return recommendations
  }
}
