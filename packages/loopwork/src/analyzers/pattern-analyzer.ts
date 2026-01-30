/**
 * Pattern-Based Output Analyzer
 *
 * Analyzes CLI output to detect indicators that additional tasks are needed
 */

import type { Task, Priority } from '../contracts/task'
import type { PluginTaskResult } from '../contracts/plugin'
import type { TaskAnalyzer, TaskAnalysisResult, SuggestedTask } from '../contracts/analysis'

/**
 * Pattern definition for detecting follow-up work
 */
interface Pattern {
  name: string
  regex: RegExp
  extractTitle: (match: RegExpMatchArray) => string
  priority: Priority
  description?: string
}

/**
 * Configuration for pattern analyzer
 */
export interface PatternAnalyzerConfig {
  patterns?: string[]
  enabled?: boolean
  maxTasksPerAnalysis?: number
}

/**
 * Implementation of TaskAnalyzer that detects follow-up work patterns
 */
export class PatternAnalyzer implements TaskAnalyzer {
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
      priority: 'medium',
      description: 'Found TODO comment in output'
    },
    {
      name: 'fixme-comment',
      regex: /FIXME:\s*(.+?)(?:\n|$)/gi,
      extractTitle: (match) => {
        const content = match[1]?.trim() || 'Fix issue'
        return content.length > 60 ? content.substring(0, 60) + '...' : content
      },
      priority: 'high',
      description: 'Found FIXME comment in output'
    },
    {
      name: 'next-steps',
      regex: /(?:Next steps?:|Follow-?up:)\s*(.+?)(?:\n\n|$)/gis,
      extractTitle: (match) => {
        const content = match[1]?.trim() || 'Handle next steps'
        return content.length > 60 ? content.substring(0, 60) + '...' : content
      },
      priority: 'medium',
      description: 'Found next steps or follow-up section'
    },
    {
      name: 'prerequisite-error',
      regex: /(?:prerequisite|required before|must|first need|depends on):\s*(.+?)(?:\n|$)/gi,
      extractTitle: (match) => {
        const content = match[1]?.trim() || 'Complete prerequisite work'
        return content.length > 60 ? content.substring(0, 60) + '...' : content
      },
      priority: 'high',
      description: 'Output suggests prerequisite work is needed'
    },
    {
      name: 'partial-completion',
      regex: /(?:partially completed|partially implemented|needs additional|incomplete|work in progress|WIP)[\s:](.+?)(?:\n|$)/gi,
      extractTitle: (match) => {
        const content = match[1]?.trim() || 'Complete partial implementation'
        return content.length > 60 ? content.substring(0, 60) + '...' : content
      },
      priority: 'medium',
      description: 'Task appears to be only partially completed'
    },
    {
      name: 'ai-suggestion',
      regex: /(?:consider|should|recommend|suggest)(?:s?)(?:\s+(?:adding|creating|implementing|refactoring|testing)):\s*(.+?)(?:\n|$)/gi,
      extractTitle: (match) => {
        const content = match[1]?.trim() || 'Consider suggested improvement'
        return content.length > 60 ? content.substring(0, 60) + '...' : content
      },
      priority: 'low',
      description: 'AI provided a suggestion for improvement'
    }
  ]

  constructor(config: PatternAnalyzerConfig = {}) {
    this.config = {
      patterns: config.patterns ?? [],
      enabled: config.enabled ?? true,
      maxTasksPerAnalysis: config.maxTasksPerAnalysis ?? 5
    }
    this.seenPatterns.clear()
  }

  async analyze(task: Task, result: PluginTaskResult): Promise<TaskAnalysisResult> {
    if (!this.config.enabled || !result.output) {
      return {
        shouldCreateTasks: false,
        suggestedTasks: [],
        reason: 'Pattern analyzer disabled or no output available'
      }
    }

    const suggestedTasks: SuggestedTask[] = []
    const patterns = this.getActivePatterns()

    for (const pattern of patterns) {
      if (suggestedTasks.length >= this.config.maxTasksPerAnalysis) {
        break
      }

      const matches = [...result.output.matchAll(pattern.regex)]
      if (matches.length === 0) {
        continue
      }

      for (const match of matches) {
        if (suggestedTasks.length >= this.config.maxTasksPerAnalysis) {
          break
        }

        const title = pattern.extractTitle(match)
        const patternKey = `${pattern.name}:${title}`

        // Skip if we've already created a task for this pattern
        if (this.seenPatterns.has(patternKey)) {
          continue
        }

        this.seenPatterns.add(patternKey)

        // Extract context from output around the match
        const context = this.extractContext(result.output, match.index ?? 0)

        suggestedTasks.push({
          title,
          description: `${pattern.description}\n\nContext:\n${context}`,
          priority: pattern.priority,
          isSubTask: true,
          parentId: task.id
        })
      }
    }

    return {
      shouldCreateTasks: suggestedTasks.length > 0,
      suggestedTasks,
      reason: suggestedTasks.length > 0
        ? `Detected ${suggestedTasks.length} potential follow-up task(s) based on output patterns`
        : 'No follow-up patterns detected in output'
    }
  }

  /**
   * Get active patterns from configured list or defaults
   */
  private getActivePatterns(): Pattern[] {
    if (this.config.patterns.length > 0) {
      // Filter default patterns based on config
      return this.defaultPatterns.filter(p => this.config.patterns.includes(p.name))
    }
    return this.defaultPatterns
  }

  /**
   * Extract context around a matched pattern
   */
  private extractContext(output: string, matchIndex: number): string {
    const contextSize = 150
    const start = Math.max(0, matchIndex - contextSize)
    const end = Math.min(output.length, matchIndex + contextSize)

    let context = output.substring(start, end).trim()

    // Clean up and truncate if needed
    if (context.length > 300) {
      context = context.substring(0, 300) + '...'
    }

    return context
  }

  /**
   * Reset seen patterns (useful for testing)
   */
  resetSeenPatterns(): void {
    this.seenPatterns.clear()
  }

  /**
   * Get list of configured pattern names
   */
  getPatternNames(): string[] {
    return this.getActivePatterns().map(p => p.name)
  }
}
