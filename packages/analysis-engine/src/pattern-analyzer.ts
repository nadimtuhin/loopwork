/**
 * Pattern-Based Analysis Engine
 *
 * Analyzes input using regex and heuristic patterns.
 * Migrated from loopwork core to analysis-engine package.
 */

import type {
  IAnalysisEngine,
  AnalysisContext,
  AnalysisResult,
  PatternMatch,
  PatternSeverity,
} from '@loopwork-ai/contracts'

/**
 * Pattern definition for detecting specific indicators
 */
interface Pattern {
  name: string
  regex: RegExp
  extractTitle: (match: RegExpMatchArray) => string
  severity: PatternSeverity
  description?: string
}

/**
 * Configuration for pattern analyzer
 */
export interface PatternAnalyzerConfig {
  patterns?: string[]
  enabled?: boolean
  maxMatches?: number
}

/**
 * Pattern-based analysis engine using regex and heuristics
 */
export class PatternAnalyzer implements IAnalysisEngine {
  readonly name = 'pattern-analyzer'
  private config: Required<PatternAnalyzerConfig>
  private seenPatterns: Set<string> = new Set()

  private readonly defaultPatterns: Pattern[] = [
    {
      name: 'todo-comment',
      regex: /TODO:\s*(.+?)(?:\n|$)/gi,
      extractTitle: (match) => {
        const content = match[1]?.trim() || 'Address TODO'
        return content.length > 60 ? content.substring(0, 60) + '...' : content
      },
      severity: 'MEDIUM',
      description: 'Found TODO comment in output',
    },
    {
      name: 'fixme-comment',
      regex: /FIXME:\s*(.+?)(?:\n|$)/gi,
      extractTitle: (match) => {
        const content = match[1]?.trim() || 'Fix issue'
        return content.length > 60 ? content.substring(0, 60) + '...' : content
      },
      severity: 'HIGH',
      description: 'Found FIXME comment in output',
    },
    {
      name: 'next-steps',
      regex: /(?:Next steps?:|Follow-?up:)\s*(.+?)(?:\n\n|$)/gis,
      extractTitle: (match) => {
        const content = match[1]?.trim() || 'Handle next steps'
        return content.length > 60 ? content.substring(0, 60) + '...' : content
      },
      severity: 'MEDIUM',
      description: 'Found next steps or follow-up section',
    },
    {
      name: 'prerequisite-error',
      regex: /(?:prerequisite|required before|must|first need|depends on):\s*(.+?)(?:\n|$)/gi,
      extractTitle: (match) => {
        const content = match[1]?.trim() || 'Complete prerequisite work'
        return content.length > 60 ? content.substring(0, 60) + '...' : content
      },
      severity: 'HIGH',
      description: 'Output suggests prerequisite work is needed',
    },
    {
      name: 'partial-completion',
      regex: /(?:partially completed|partially implemented|needs additional|incomplete|work in progress|WIP)[\s:](.+?)(?:\n|$)/gi,
      extractTitle: (match) => {
        const content = match[1]?.trim() || 'Complete partial implementation'
        return content.length > 60 ? content.substring(0, 60) + '...' : content
      },
      severity: 'MEDIUM',
      description: 'Task appears to be only partially completed',
    },
    {
      name: 'ai-suggestion',
      regex: /(?:consider|should|recommend|suggest)(?:s?)(?:\s+(?:adding|creating|implementing|refactoring|testing)):\s*(.+?)(?:\n|$)/gi,
      extractTitle: (match) => {
        const content = match[1]?.trim() || 'Consider suggested improvement'
        return content.length > 60 ? content.substring(0, 60) + '...' : content
      },
      severity: 'INFO',
      description: 'AI provided a suggestion for improvement',
    },
    {
      name: 'error-detected',
      regex: /(?:ERROR|CRITICAL|FATAL):\s*(.+?)(?:\n|$)/gi,
      extractTitle: (match) => {
        const content = match[1]?.trim() || 'Address error'
        return content.length > 60 ? content.substring(0, 60) + '...' : content
      },
      severity: 'CRITICAL',
      description: 'Critical error detected in output',
    },
    {
      name: 'warning-detected',
      regex: /(?:WARNING|WARN):\s*(.+?)(?:\n|$)/gi,
      extractTitle: (match) => {
        const content = match[1]?.trim() || 'Address warning'
        return content.length > 60 ? content.substring(0, 60) + '...' : content
      },
      severity: 'WARN',
      description: 'Warning detected in output',
    },
  ]

  constructor(config: PatternAnalyzerConfig = {}) {
    this.config = {
      patterns: config.patterns ?? [],
      enabled: config.enabled ?? true,
      maxMatches: config.maxMatches ?? 10,
    }
    this.seenPatterns.clear()
  }

  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    if (!this.config.enabled || !context.input) {
      return {
        success: true,
        confidence: 0,
        findings: [],
        suggestions: [],
        patterns: [],
        metadata: { reason: 'Pattern analyzer disabled or no input available' },
      }
    }

    const patterns = this.getActivePatterns()
    const allMatches: PatternMatch[] = []
    const findings: string[] = []
    const suggestions: string[] = []

    for (const pattern of patterns) {
      if (allMatches.length >= this.config.maxMatches) {
        break
      }

      const matches = [...context.input.matchAll(pattern.regex)]
      if (matches.length === 0) {
        continue
      }

      for (const match of matches) {
        if (allMatches.length >= this.config.maxMatches) {
          break
        }

        const title = pattern.extractTitle(match)
        const patternKey = `${pattern.name}:${title}`

        // Skip if we've already seen this pattern
        if (this.seenPatterns.has(patternKey)) {
          continue
        }

        this.seenPatterns.add(patternKey)

        // Extract context from input around the match
        const contextStr = this.extractContext(context.input, match.index ?? 0)

        const patternMatch: PatternMatch = {
          pattern: pattern.name,
          severity: pattern.severity,
          context: {
            title,
            description: pattern.description || '',
            extracted: contextStr,
          },
          rawLine: match[0] || '',
          timestamp: context.timestamp || new Date(),
        }

        allMatches.push(patternMatch)
        findings.push(`${pattern.name}: ${title}`)

        // Add suggestions based on severity
        if (pattern.severity === 'CRITICAL' || pattern.severity === 'HIGH') {
          suggestions.push(`Address ${pattern.name}: ${title}`)
        }
      }
    }

    const confidence = allMatches.length > 0 ? 0.8 : 1.0

    return {
      success: true,
      confidence,
      findings,
      suggestions,
      patterns: allMatches,
      metadata: {
        analyzedAt: new Date().toISOString(),
        patternCount: allMatches.length,
        reason:
          allMatches.length > 0
            ? `Detected ${allMatches.length} pattern match(es)`
            : 'No patterns detected in input',
      },
    }
  }

  supports(analysisType: string): boolean {
    return analysisType === 'pattern' || analysisType === 'regex' || analysisType === 'heuristic'
  }

  async initialize(): Promise<void> {
    this.seenPatterns.clear()
  }

  async dispose(): Promise<void> {
    this.seenPatterns.clear()
  }

  /**
   * Get active patterns from configured list or defaults
   */
  private getActivePatterns(): Pattern[] {
    if (this.config.patterns.length > 0) {
      // Filter default patterns based on config
      return this.defaultPatterns.filter((p) => this.config.patterns.includes(p.name))
    }
    return this.defaultPatterns
  }

  /**
   * Extract context around a matched pattern
   */
  private extractContext(input: string, matchIndex: number): string {
    const contextSize = 150
    const start = Math.max(0, matchIndex - contextSize)
    const end = Math.min(input.length, matchIndex + contextSize)

    let context = input.substring(start, end).trim()

    // Clean up and truncate if needed
    if (context.length > 300) {
      context = context.substring(0, 300) + '...'
    }

    return context
  }

  /**
   * Reset seen patterns (useful for testing or new analysis sessions)
   */
  resetSeenPatterns(): void {
    this.seenPatterns.clear()
  }

  /**
   * Get list of configured pattern names
   */
  getPatternNames(): string[] {
    return this.getActivePatterns().map((p) => p.name)
  }
}
