/**
 * Error entry for correlation analysis
 */
export interface ErrorEntry {
  message: string
  taskId: string
  model?: string
  timestamp: Date
  metadata?: Record<string, unknown>
}

/**
 * Error group from correlation analysis
 */
export interface ErrorGroup {
  signature: string
  message: string
  count: number
  firstOccurred: Date
  lastOccurred: Date
  affectedTasks: string[]
  affectedModels: string[]
  examples: ErrorExample[]
}

/**
 * Error example within a group
 */
export interface ErrorExample {
  taskId: string
  timestamp: Date
  message: string
}

/**
 * Error correlation report
 */
export interface ErrorCorrelationReport {
  totalErrors: number
  uniqueErrorTypes: number
  mostCommonError: ErrorGroup | null
  recentlyOccurred: ErrorGroup[]
  byModel: Record<string, ErrorGroup[]>
  groups: ErrorGroup[]
}

/**
 * Configuration for error correlation analysis
 */
export interface ErrorCorrelationConfig {
  /** Maximum length of error signature (default: 100) */
  signatureMaxLength?: number
  /** Number of examples to keep per group (default: 3) */
  maxExamplesPerGroup?: number
  /** Time window for "recent" errors in hours (default: 24) */
  recentWindowHours?: number
  /** Enable grouping by stack trace patterns */
  groupByStackTrace?: boolean
  /** Ignore patterns (regex strings) for filtering out noise */
  ignorePatterns?: string[]
}

/**
 * ErrorCorrelationAnalyzer - Groups and analyzes errors for pattern detection
 * 
 * Provides intelligent error correlation:
 * - Groups similar errors by message signature
 * - Tracks affected tasks and models
 * - Identifies most common and recent errors
 * - Filters noise with ignore patterns
 */
export class ErrorCorrelationAnalyzer {
  private entries: ErrorEntry[] = []
  private config: Required<ErrorCorrelationConfig>
  private ignoreRegexes: RegExp[]

  constructor(config: ErrorCorrelationConfig = {}) {
    this.config = {
      signatureMaxLength: config.signatureMaxLength ?? 100,
      maxExamplesPerGroup: config.maxExamplesPerGroup ?? 3,
      recentWindowHours: config.recentWindowHours ?? 24,
      groupByStackTrace: config.groupByStackTrace ?? false,
      ignorePatterns: config.ignorePatterns ?? [],
    }

    this.ignoreRegexes = this.config.ignorePatterns.map(p => new RegExp(p, 'i'))
  }

  /**
   * Record an error for correlation analysis
   */
  record(entry: ErrorEntry): void {
    if (this.shouldIgnore(entry.message)) {
      return
    }

    this.entries.push(entry)
  }

  /**
   * Record an error with individual parameters
   */
  recordError(
    message: string,
    taskId: string,
    model?: string,
    metadata?: Record<string, unknown>
  ): void {
    this.record({
      message,
      taskId,
      model,
      timestamp: new Date(),
      metadata,
    })
  }

  /**
   * Analyze and group all recorded errors
   */
  analyze(): ErrorGroup[] {
    const groups = new Map<string, ErrorGroup>()

    for (const entry of this.entries) {
      const signature = this.extractSignature(entry.message)

      if (!groups.has(signature)) {
        groups.set(signature, {
          signature,
          message: this.extractMessage(entry.message),
          count: 0,
          firstOccurred: entry.timestamp,
          lastOccurred: entry.timestamp,
          affectedTasks: [],
          affectedModels: [],
          examples: [],
        })
      }

      const group = groups.get(signature)!
      group.count++

      if (entry.timestamp < group.firstOccurred) {
        group.firstOccurred = entry.timestamp
      }
      if (entry.timestamp > group.lastOccurred) {
        group.lastOccurred = entry.timestamp
      }

      if (!group.affectedTasks.includes(entry.taskId)) {
        group.affectedTasks.push(entry.taskId)
      }

      if (entry.model && !group.affectedModels.includes(entry.model)) {
        group.affectedModels.push(entry.model)
      }

      if (group.examples.length < this.config.maxExamplesPerGroup) {
        group.examples.push({
          taskId: entry.taskId,
          timestamp: entry.timestamp,
          message: entry.message.substring(0, 200),
        })
      }
    }

    return Array.from(groups.values()).sort((a, b) => b.count - a.count)
  }

  /**
   * Get full error correlation report
   */
  getReport(): ErrorCorrelationReport {
    const groups = this.analyze()
    const now = new Date()
    const recentCutoff = new Date(now.getTime() - this.config.recentWindowHours * 60 * 60 * 1000)

    const recentlyOccurred = groups.filter(g => g.lastOccurred >= recentCutoff)

    const byModel: Record<string, ErrorGroup[]> = {}
    for (const group of groups) {
      for (const model of group.affectedModels) {
        if (!byModel[model]) {
          byModel[model] = []
        }
        byModel[model].push(group)
      }
    }

    return {
      totalErrors: this.entries.length,
      uniqueErrorTypes: groups.length,
      mostCommonError: groups[0] || null,
      recentlyOccurred,
      byModel,
      groups,
    }
  }

  /**
   * Get errors for a specific task
   */
  getTaskErrors(taskId: string): ErrorEntry[] {
    return this.entries.filter(e => e.taskId === taskId)
  }

  /**
   * Get errors for a specific model
   */
  getModelErrors(model: string): ErrorEntry[] {
    return this.entries.filter(e => e.model === model)
  }

  /**
   * Get recent errors within time window
   */
  getRecentErrors(hours: number = 24): ErrorEntry[] {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000)
    return this.entries.filter(e => e.timestamp >= cutoff)
  }

  /**
   * Get error groups affecting a specific task
   */
  getGroupsForTask(taskId: string): ErrorGroup[] {
    return this.analyze().filter(g => g.affectedTasks.includes(taskId))
  }

  /**
   * Find errors similar to a given message
   */
  findSimilar(message: string, threshold: number = 0.8): ErrorEntry[] {
    const targetSignature = this.extractSignature(message)

    return this.entries.filter(entry => {
      const entrySignature = this.extractSignature(entry.message)
      const similarity = this.calculateSimilarity(targetSignature, entrySignature)
      return similarity >= threshold
    })
  }

  /**
   * Clear all recorded errors
   */
  clear(): void {
    this.entries = []
  }

  /**
   * Get total error count
   */
  getErrorCount(): number {
    return this.entries.length
  }

  /**
   * Check if an error message should be ignored
   */
  private shouldIgnore(message: string): boolean {
    return this.ignoreRegexes.some(regex => regex.test(message))
  }

  /**
   * Extract error signature for grouping
   */
  private extractSignature(message: string): string {
    const normalized = message
      .replace(/\b[a-f0-9]{6,}\b/gi, 'ID')
      .replace(/\d+/g, '#')
      .replace(/\s+/g, ' ')
      .trim()

    if (this.config.groupByStackTrace) {
      const stackLines = normalized.split('\n').filter(line =>
        line.includes('at ') || line.includes('Error:')
      )
      if (stackLines.length > 0) {
        return stackLines.slice(0, 3).join(' ').substring(0, this.config.signatureMaxLength)
      }
    }

    return normalized.substring(0, this.config.signatureMaxLength)
  }

  /**
   * Extract human-readable message from error
   */
  private extractMessage(message: string): string {
    const firstLine = message.split('\n')[0].trim()
    return firstLine.substring(0, this.config.signatureMaxLength)
  }

  /**
   * Calculate similarity between two signatures (0-1)
   */
  private calculateSimilarity(a: string, b: string): number {
    if (a === b) return 1.0
    if (a.length === 0 || b.length === 0) return 0.0

    const longer = a.length > b.length ? a : b
    const shorter = a.length > b.length ? b : a

    const distance = this.levenshteinDistance(longer, shorter)
    return (longer.length - distance) / longer.length
  }

  /**
   * Calculate Levenshtein distance between strings
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = []

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i]
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          )
        }
      }
    }

    return matrix[b.length][a.length]
  }
}

/**
 * Create a new ErrorCorrelationAnalyzer instance
 */
export function createErrorCorrelationAnalyzer(
  config?: ErrorCorrelationConfig
): ErrorCorrelationAnalyzer {
  return new ErrorCorrelationAnalyzer(config)
}
