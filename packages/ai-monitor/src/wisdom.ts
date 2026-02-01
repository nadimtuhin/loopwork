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
import type { ErrorPattern, WisdomPattern } from './types'
import { logger } from './utils'

// Import LoopworkState from @loopwork-ai/loopwork if available, otherwise use fallback
let LoopworkState: any

// Fallback implementation when loopwork is not available
class FallbackLoopworkState {
  paths: any
  constructor(options?: { projectRoot?: string } | string) {
    const projectRoot = typeof options === 'string' ? options : options?.projectRoot || process.cwd()
    const stateDir = path.join(projectRoot, '.loopwork', 'ai-monitor')
    this.paths = {
      wisdom: () => path.join(stateDir, 'wisdom.json'),
      aiMonitorDir: () => stateDir
    }
  }
}

try {
  const loopwork = require('@loopwork-ai/loopwork')
  LoopworkState = loopwork.LoopworkState || FallbackLoopworkState
} catch {
  LoopworkState = FallbackLoopworkState
}

export interface WisdomStore {
  lastUpdated: string
  patterns: WisdomPattern[]
  version?: string
  sessionCount?: number
  totalHeals?: number
  totalFailures?: number
}

export interface WisdomConfig {
  enabled?: boolean
  stateDir?: string
  patternExpiryDays?: number
  minSuccessForTrust?: number
}

/**
 * WisdomSystem - Learn and remember successful healing patterns
 */
export class WisdomSystem {
  private config: Required<WisdomConfig>
  private stateDir: string
  private wisdomFile: string
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
        lastUpdated: new Date().toISOString(),
        patterns: [],
        version: '1.0',
        sessionCount: 0,
        totalHeals: 0,
        totalFailures: 0
      }
    }

    try {
      const data = fs.readFileSync(this.wisdomFile, 'utf8')
      const store = JSON.parse(data) as WisdomStore

      const expiryMs = this.config.patternExpiryDays * 24 * 60 * 60 * 1000
      const now = Date.now()
      
      const before = store.patterns.length
      store.patterns = store.patterns.filter(p => {
        const lastSeen = new Date(p.lastSeen).getTime()
        return (now - lastSeen) < expiryMs
      })

      const removed = before - store.patterns.length
      if (removed > 0) {
        logger.info(`AI Monitor: Expired ${removed} old patterns from wisdom`)
      }

      logger.debug(`Loaded wisdom store with ${store.patterns.length} active patterns`)
      return store
    } catch (error) {
      logger.warn(`Failed to load wisdom store: ${error instanceof Error ? error.message : String(error)}`)
      return {
        lastUpdated: new Date().toISOString(),
        patterns: [],
        version: '1.0',
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

      this.store.lastUpdated = new Date().toISOString()
      fs.writeFileSync(this.wisdomFile, JSON.stringify(this.store, null, 2))
      logger.debug(`Wisdom store saved (${this.store.patterns.length} patterns)`)
    } catch (error) {
      logger.warn(`Failed to save wisdom store: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  recordSuccess(pattern: ErrorPattern, actionName: string, context?: WisdomPattern['context']): boolean {
    if (!this.config.enabled) return false

    const signature = this.hashPattern(pattern)
    let learned = this.store.patterns.find(p => p.errorSignature === signature && p.fixAction === actionName)

    const now = new Date().toISOString()

    if (!learned) {
      learned = {
        id: `wisdom-${signature}-${Date.now()}`,
        errorSignature: signature,
        fixAction: actionName,
        successCount: 1,
        firstSeen: now,
        lastSeen: now,
        context
      }
      this.store.patterns.push(learned)
      logger.info(`AI Monitor: Learned new successful healing pattern: ${pattern.name} via ${actionName}`)
    } else {
      learned.successCount++
      learned.lastSeen = now
      if (context) {
        learned.context = {
          fileTypes: Array.from(new Set([...(learned.context?.fileTypes || []), ...(context.fileTypes || [])])),
          errorTypes: Array.from(new Set([...(learned.context?.errorTypes || []), ...(context.errorTypes || [])]))
        }
      }
      logger.debug(`AI Monitor: Pattern ${pattern.name} recorded success (${learned.successCount} total)`)
    }

    if (this.store.totalHeals !== undefined) this.store.totalHeals++
    this.saveWisdom()
    return true
  }

  recordFailure(pattern: ErrorPattern, actionName: string): void {
    if (!this.config.enabled) return

    if (this.store.totalFailures !== undefined) this.store.totalFailures++
    this.saveWisdom()
  }

  getPatterns(): WisdomPattern[] {
    return [...this.store.patterns].sort((a, b) => b.successCount - a.successCount)
  }

  getStats() {
    return {
      sessionId: this.sessionId,
      uptime: Date.now() - this.sessionStartTime,
      totalPatterns: this.store.patterns.length,
      trustworthyPatterns: this.store.patterns.filter(
        p => p.successCount >= this.config.minSuccessForTrust
      ).length,
      totalHeals: this.store.totalHeals,
      totalFailures: this.store.totalFailures
    }
  }

  clearExpired(): number {
    const expiryMs = this.config.patternExpiryDays * 24 * 60 * 60 * 1000
    const now = Date.now()
    const before = this.store.patterns.length
    
    this.store.patterns = this.store.patterns.filter(p => {
      const lastSeen = new Date(p.lastSeen).getTime()
      return (now - lastSeen) < expiryMs
    })

    const removed = before - this.store.patterns.length
    if (removed > 0) {
      this.saveWisdom()
      logger.info(`AI Monitor: Removed ${removed} expired patterns`)
    }

    return removed
  }

  reset(): void {
    if (!this.config.enabled) return

    this.store = {
      lastUpdated: new Date().toISOString(),
      patterns: [],
      version: '1.0',
      sessionCount: 0,
      totalHeals: 0,
      totalFailures: 0
    }
    this.saveWisdom()
    logger.warn('AI Monitor: Wisdom store reset')
  }
      this.store.patterns.push(learned)
      logger.info(`AI Monitor: Learned new successful healing pattern: ${pattern.name} via ${actionName}`)
    } else {
      learned.successCount++
      learned.lastSeen = now
      if (context) {
        learned.context = {
          fileTypes: Array.from(new Set([...(learned.context?.fileTypes || []), ...(context.fileTypes || [])])),
          errorTypes: Array.from(new Set([...(learned.context?.errorTypes || []), ...(context.errorTypes || [])]))
        }
      }
      logger.debug(`AI Monitor: Pattern ${pattern.name} recorded success (${learned.successCount} total)`)
    }

    if (this.store.totalHeals !== undefined) this.store.totalHeals++
    this.saveWisdom()
    return true
  }

  /**
   * Record a failed healing action
   */
  recordFailure(pattern: ErrorPattern, actionName: string): void {
    if (!this.config.enabled) return

    if (this.store.totalFailures !== undefined) this.store.totalFailures++
    this.saveWisdom()
  }

  findPattern(pattern: ErrorPattern): WisdomPattern | null {
    if (!this.config.enabled) return null

    const signature = this.hashPattern(pattern)
    const matches = this.store.patterns
      .filter(p => p.errorSignature === signature)
      .sort((a, b) => b.successCount - a.successCount)

    if (matches.length === 0) return null

    const best = matches[0]

    if (best.successCount < this.config.minSuccessForTrust) {
      logger.debug(`Pattern ${pattern.name} not yet trustworthy (${best.successCount}/${this.config.minSuccessForTrust} successes)`)
      return null
    }

    return best
  }

  /**
   * Get all learned patterns
   */
  getPatterns(): WisdomPattern[] {
    return [...this.store.patterns].sort((a, b) => b.successCount - a.successCount)
  }

  /**
   * Get wisdom statistics
   */
  getStats() {
    return {
      sessionId: this.sessionId,
      uptime: Date.now() - this.sessionStartTime,
      totalPatterns: this.store.patterns.length,
      trustworthyPatterns: this.store.patterns.filter(
        p => p.successCount >= this.config.minSuccessForTrust
      ).length,
      totalHeals: this.store.totalHeals,
      totalFailures: this.store.totalFailures
    }
  }

  /**
   * Clear expired patterns
   */
  clearExpired(): number {
    const expiryMs = this.config.patternExpiryDays * 24 * 60 * 60 * 1000
    const now = Date.now()
    const before = this.store.patterns.length
    
    this.store.patterns = this.store.patterns.filter(p => {
      const lastSeen = new Date(p.lastSeen).getTime()
      return (now - lastSeen) < expiryMs
    })

    const removed = before - this.store.patterns.length
    if (removed > 0) {
      this.saveWisdom()
      logger.info(`AI Monitor: Removed ${removed} expired patterns`)
    }

    return removed
  }

  /**
   * Reset wisdom store
   */
  reset(): void {
    if (!this.config.enabled) return

    this.store = {
      lastUpdated: new Date().toISOString(),
      patterns: [],
      version: '1.0',
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
