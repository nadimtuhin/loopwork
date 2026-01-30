/**
 * Wisdom System for AI Monitor
 *
 * Stores learned error patterns and healing actions across sessions.
 * Tracks what fixes work, accumulates knowledge, and expires old patterns.
 *
 * Storage Structure:
 * .loopwork/ai-monitor/
 *   ├── wisdom.json          - Main wisdom store
 *   ├── patterns/            - Individual pattern files
 *   │   └── {hash}.json
 *   └── sessions/            - Session history
 *       └── {sessionId}.json
 */

import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'
import type { ErrorPattern } from './types'
import { logger } from '../core/utils'
import { LoopworkState } from '../core/loopwork-state'

export interface LearnedPattern {
  signature: string                    // Hash of error pattern
  pattern: ErrorPattern                // The original error pattern
  successCount: number                 // Times this fix worked
  failureCount: number                 // Times this fix failed
  successRate: number                  // Calculated: successCount / (successCount + failureCount)
  lastSeen: number                     // Timestamp of last encounter
  firstSeen: number                    // Timestamp of first encounter
  expiresAt: number                    // Timestamp when pattern expires
  improvements: string[]               // Notes on pattern refinements
}

export interface WisdomStore {
  version: string
  lastUpdated: number
  patterns: LearnedPattern[]
  sessionCount: number
  totalHeals: number
  totalFailures: number
}

export interface WisdomConfig {
  enabled?: boolean
  stateDir?: string
  patternExpiryDays?: number
  minSuccessForTrust?: number          // Min successes before considering pattern reliable
}

/**
 * WisdomSystem - Learn and remember successful healing patterns
 */
export class WisdomSystem {
  private config: Required<WisdomConfig>
  private stateDir: string
  private wisdomFile: string
  private patternsDir: string
  private sessionsDir: string
  private store: WisdomStore
  private sessionId: string
  private sessionStartTime: number

  constructor(config: WisdomConfig = {}) {
    const loopworkState = new LoopworkState()
    const defaultStateDir = loopworkState.paths.aiMonitorDir()

    this.config = {
      enabled: config.enabled ?? true,
      stateDir: config.stateDir ?? defaultStateDir,
      patternExpiryDays: config.patternExpiryDays ?? 30,
      minSuccessForTrust: config.minSuccessForTrust ?? 3
    }

    this.stateDir = this.config.stateDir
    this.wisdomFile = path.join(this.stateDir, 'wisdom.json')
    this.patternsDir = path.join(this.stateDir, 'patterns')
    this.sessionsDir = path.join(this.stateDir, 'sessions')
    this.sessionId = this.generateSessionId()
    this.sessionStartTime = Date.now()

    // Initialize store
    this.store = this.loadWisdom()
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Generate a hash for an error pattern
   */
  private hashPattern(pattern: ErrorPattern): string {
    const content = JSON.stringify({
      name: pattern.name,
      regex: pattern.regex.source,
      category: pattern.category
    })
    return createHash('sha256').update(content).digest('hex').substr(0, 16)
  }

  /**
   * Load wisdom store from disk
   */
  private loadWisdom(): WisdomStore {
    if (!fs.existsSync(this.wisdomFile)) {
      logger.debug('Creating new wisdom store')
      return {
        version: '1.0',
        lastUpdated: Date.now(),
        patterns: [],
        sessionCount: 0,
        totalHeals: 0,
        totalFailures: 0
      }
    }

    try {
      const data = fs.readFileSync(this.wisdomFile, 'utf8')
      const store = JSON.parse(data) as WisdomStore

      // Clean up expired patterns
      store.patterns = store.patterns.filter(p => p.expiresAt > Date.now())

      logger.debug(`Loaded wisdom store with ${store.patterns.length} active patterns`)
      return store
    } catch (error) {
      logger.warn(`Failed to load wisdom store: ${error instanceof Error ? error.message : String(error)}`)
      return {
        version: '1.0',
        lastUpdated: Date.now(),
        patterns: [],
        sessionCount: 0,
        totalHeals: 0,
        totalFailures: 0
      }
    }
  }

  /**
   * Save wisdom store to disk
   */
  private saveWisdom(): void {
    if (!this.config.enabled) return

    try {
      // Ensure directories exist
      if (!fs.existsSync(this.stateDir)) {
        fs.mkdirSync(this.stateDir, { recursive: true })
      }

      this.store.lastUpdated = Date.now()
      fs.writeFileSync(this.wisdomFile, JSON.stringify(this.store, null, 2))
      logger.debug(`Wisdom store saved (${this.store.patterns.length} patterns)`)
    } catch (error) {
      logger.warn(`Failed to save wisdom store: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Record a successful healing action
   * Returns true if pattern was learned/updated
   */
  recordSuccess(pattern: ErrorPattern, improvement?: string): boolean {
    if (!this.config.enabled) return false

    const signature = this.hashPattern(pattern)
    let learned = this.store.patterns.find(p => p.signature === signature)

    if (!learned) {
      // New pattern - create entry
      const expiryMs = this.config.patternExpiryDays * 24 * 60 * 60 * 1000
      learned = {
        signature,
        pattern,
        successCount: 1,
        failureCount: 0,
        successRate: 1.0,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        expiresAt: Date.now() + expiryMs,
        improvements: improvement ? [improvement] : []
      }
      this.store.patterns.push(learned)
      logger.info(`AI Monitor: Learned new pattern: ${pattern.name}`)
    } else {
      // Update existing pattern
      learned.successCount++
      learned.lastSeen = Date.now()
      learned.successRate = learned.successCount / (learned.successCount + learned.failureCount)

      // Extend expiry on successful use
      const expiryMs = this.config.patternExpiryDays * 24 * 60 * 60 * 1000
      learned.expiresAt = Date.now() + expiryMs

      if (improvement) {
        learned.improvements.push(improvement)
      }

      logger.debug(`AI Monitor: Pattern ${pattern.name} recorded success (${learned.successCount} total)`)
    }

    this.store.totalHeals++
    this.saveWisdom()
    return true
  }

  /**
   * Record a failed healing action
   */
  recordFailure(pattern: ErrorPattern, reason?: string): void {
    if (!this.config.enabled) return

    const signature = this.hashPattern(pattern)
    let learned = this.store.patterns.find(p => p.signature === signature)

    if (!learned) {
      // New failed pattern - create entry to track it
      const expiryMs = this.config.patternExpiryDays * 24 * 60 * 60 * 1000
      learned = {
        signature,
        pattern,
        successCount: 0,
        failureCount: 1,
        successRate: 0.0,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        expiresAt: Date.now() + expiryMs,
        improvements: reason ? [`failed: ${reason}`] : []
      }
      this.store.patterns.push(learned)
    } else {
      // Update existing pattern
      learned.failureCount++
      learned.successRate = learned.successCount / (learned.successCount + learned.failureCount)
      learned.lastSeen = Date.now()

      if (reason) {
        learned.improvements.push(`failed: ${reason}`)
      }
    }

    this.store.totalFailures++
    this.saveWisdom()
  }

  /**
   * Find a learned pattern by error pattern
   * Returns the pattern if found and trustworthy (success rate > threshold)
   */
  findPattern(pattern: ErrorPattern): LearnedPattern | null {
    if (!this.config.enabled) return null

    const signature = this.hashPattern(pattern)
    const learned = this.store.patterns.find(p => p.signature === signature)

    if (!learned) {
      return null
    }

    // Check if pattern is expired
    if (learned.expiresAt < Date.now()) {
      logger.debug(`Pattern ${pattern.name} has expired`)
      return null
    }

    // Check if pattern is trustworthy (enough successes)
    if (learned.successCount < this.config.minSuccessForTrust) {
      logger.debug(`Pattern ${pattern.name} not yet trustworthy (${learned.successCount}/${this.config.minSuccessForTrust} successes)`)
      return null
    }

    return learned
  }

  /**
   * Get all learned patterns (sorted by success rate)
   */
  getPatterns(filter?: { category?: string; minSuccessRate?: number }): LearnedPattern[] {
    let patterns = [...this.store.patterns]

    // Filter by category
    if (filter?.category) {
      patterns = patterns.filter(p => p.pattern.category === filter.category)
    }

    // Filter by success rate
    if (filter?.minSuccessRate !== undefined) {
      patterns = patterns.filter(p => p.successRate >= filter.minSuccessRate!)
    }

    // Sort by success rate (highest first), then by count
    patterns.sort((a, b) => {
      if (b.successRate !== a.successRate) {
        return b.successRate - a.successRate
      }
      return b.successCount - a.successCount
    })

    return patterns
  }

  /**
   * Get wisdom statistics
   */
  getStats() {
    return {
      sessionId: this.sessionId,
      uptime: Date.now() - this.sessionStartTime,
      totalPatterns: this.store.patterns.length,
      activePatterns: this.store.patterns.filter(p => p.expiresAt > Date.now()).length,
      trustworthyPatterns: this.store.patterns.filter(
        p => p.successCount >= this.config.minSuccessForTrust
      ).length,
      totalHeals: this.store.totalHeals,
      totalFailures: this.store.totalFailures,
      successRate: this.store.totalHeals / Math.max(1, this.store.totalHeals + this.store.totalFailures),
      topPatterns: this.getPatterns()
        .slice(0, 5)
        .map(p => ({
          name: p.pattern.name,
          successCount: p.successCount,
          failureCount: p.failureCount,
          successRate: (p.successRate * 100).toFixed(1) + '%'
        }))
    }
  }

  /**
   * Export wisdom to session history
   */
  exportSessionHistory(): void {
    if (!this.config.enabled) return

    try {
      if (!fs.existsSync(this.sessionsDir)) {
        fs.mkdirSync(this.sessionsDir, { recursive: true })
      }

      const sessionFile = path.join(this.sessionsDir, `${this.sessionId}.json`)
      const sessionData = {
        sessionId: this.sessionId,
        startTime: this.sessionStartTime,
        endTime: Date.now(),
        duration: Date.now() - this.sessionStartTime,
        stats: this.getStats(),
        patterns: this.store.patterns.map(p => ({
          name: p.pattern.name,
          category: p.pattern.category,
          successCount: p.successCount,
          failureCount: p.failureCount,
          successRate: (p.successRate * 100).toFixed(1) + '%'
        }))
      }

      fs.writeFileSync(sessionFile, JSON.stringify(sessionData, null, 2))
      logger.debug(`Session history exported to ${sessionFile}`)
    } catch (error) {
      logger.warn(`Failed to export session history: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Clear expired patterns
   */
  clearExpired(): number {
    const before = this.store.patterns.length
    this.store.patterns = this.store.patterns.filter(p => p.expiresAt > Date.now())
    const removed = before - this.store.patterns.length

    if (removed > 0) {
      this.saveWisdom()
      logger.info(`AI Monitor: Removed ${removed} expired patterns`)
    }

    return removed
  }

  /**
   * Reset wisdom store (use with caution!)
   */
  reset(): void {
    if (!this.config.enabled) return

    this.store = {
      version: '1.0',
      lastUpdated: Date.now(),
      patterns: [],
      sessionCount: 0,
      totalHeals: 0,
      totalFailures: 0
    }
    this.saveWisdom()
    logger.warn('AI Monitor: Wisdom store reset')
  }
}

/**
 * Factory function to create WisdomSystem
 */
export function createWisdomSystem(config?: WisdomConfig): WisdomSystem {
  return new WisdomSystem(config)
}
