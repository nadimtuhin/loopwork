/**
 * Pattern Registry - Known error pattern matchers
 */

import type { MonitorAction } from './types'

export type PatternSeverity = 'INFO' | 'WARN' | 'ERROR' | 'HIGH'

export interface PatternMatch {
  pattern: string
  severity: PatternSeverity
  context: Record<string, string>
  rawLine: string
}

export interface ErrorPattern {
  name: string
  regex: RegExp
  severity: PatternSeverity
  action: MonitorAction
  extractContext?: (match: RegExpMatchArray) => Record<string, string>
  category?: string
  description?: string
}

/**
 * Known error patterns with regex matchers
 */
export const ERROR_PATTERNS: ErrorPattern[] = [
  {
    name: 'prd-not-found',
    regex: /PRD file not found:?\s*(.+)/i,
    severity: 'WARN',
    action: { type: 'notify' },
    extractContext: (match) => ({ path: match[1]?.trim() || '' })
  },
  {
    name: 'rate-limit',
    regex: /rate limit|429|too many requests/i,
    severity: 'HIGH',
    action: { type: 'pause', duration: 60000 },
    extractContext: () => ({})
  },
  {
    name: 'env-var-required',
    regex: /(\w+)\s+is required|environment variable\s+(\w+)\s+not found/i,
    severity: 'ERROR',
    action: { type: 'notify' },
    extractContext: (match) => ({
      envVar: match[1] || match[2] || 'unknown'
    })
  },
  {
    name: 'task-failed',
    regex: /task failed|execution failed|error executing task/i,
    severity: 'HIGH',
    action: { type: 'analyze' },
    extractContext: () => ({})
  },
  {
    name: 'timeout',
    regex: /timeout exceeded|timed out|execution timeout/i,
    severity: 'WARN',
    action: { type: 'notify' },
    extractContext: () => ({})
  },
  {
    name: 'no-pending-tasks',
    regex: /no pending tasks|all tasks completed/i,
    severity: 'INFO',
    action: { type: 'notify' },
    extractContext: () => ({})
  },
  {
    name: 'file-not-found',
    regex: /(?:file|path)\s+(?:not found|does not exist):\s*(.+)/i,
    severity: 'ERROR',
    action: { type: 'notify' },
    extractContext: (match) => ({ path: match[1]?.trim() || '' })
  },
  {
    name: 'permission-denied',
    regex: /permission denied|EACCES|EPERM/i,
    severity: 'ERROR',
    action: { type: 'notify' },
    extractContext: () => ({})
  },
  {
    name: 'network-error',
    regex: /network error|ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i,
    severity: 'WARN',
    action: { type: 'pause', duration: 5000 },
    extractContext: () => ({})
  },
  {
    name: 'plugin-error',
    regex: /plugin\s+(\w+)\s+(?:failed|error)/i,
    severity: 'WARN',
    action: { type: 'notify' },
    extractContext: (match) => ({ plugin: match[1] || 'unknown' })
  },
  {
    name: 'circuit-breaker',
    regex: /circuit breaker|max retries exceeded|too many failures/i,
    severity: 'HIGH',
    action: { type: 'pause', duration: 30000 },
    extractContext: () => ({})
  }
]

/**
 * Match a log line against known patterns
 * @param line - Log line to analyze
 * @returns Pattern match if found, null otherwise
 */
export function matchPattern(line: string): PatternMatch | null {
  for (const pattern of ERROR_PATTERNS) {
    const match = line.match(pattern.regex)
    if (match) {
      return {
        pattern: pattern.name,
        severity: pattern.severity,
        context: pattern.extractContext ? pattern.extractContext(match) : {},
        rawLine: line
      }
    }
  }
  return null
}

/**
 * Get error pattern by name
 * @param patternName - Pattern name to find
 * @returns ErrorPattern object or null if not found
 */
export function getPatternByName(patternName: string): ErrorPattern | null {
  return ERROR_PATTERNS.find(p => p.name === patternName) || null
}

/**
 * Check if a pattern is known (has explicit handling)
 * @param patternName - Pattern name to check
 * @returns true if pattern is known
 */
export function isKnownPattern(patternName: string): boolean {
  return ERROR_PATTERNS.some(p => p.name === patternName)
}

/**
 * Get all pattern names for a given severity level
 * @param severity - Severity level to filter by
 * @returns Array of pattern names
 */
export function getPatternsBySeverity(severity: PatternSeverity): string[] {
  return ERROR_PATTERNS
    .filter(p => p.severity === severity)
    .map(p => p.name)
}
