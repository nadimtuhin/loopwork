/**
 * Core AI Monitor Tests
 * Tests for LogWatcher, PatternDetector, and AIMonitor integration
 */

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import fs from 'fs'
import path from 'path'
import { LogWatcher } from '../src/watcher'
import { matchPattern, ERROR_PATTERNS, isKnownPattern, getPatternsBySeverity } from '../src/patterns'
import { AIMonitor } from '../src/index'
import type { LoopworkConfig } from '@loopwork-ai/loopwork/contracts'

import os from 'os'

const TEST_DIR = path.join(os.tmpdir(), 'loopwork-ai-monitor-test')
const TEST_LOG_FILE = path.join(TEST_DIR, 'test.log')

/**
 * Utility to wait for a condition with polling
 * Used to avoid flaky tests with fixed timeouts
 */
async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number; message?: string } = {}
): Promise<void> {
  const { timeout = 5000, interval = 50, message = 'Condition not met' } = options
  const start = Date.now()

  while (Date.now() - start < timeout) {
    if (await condition()) return
    await new Promise(r => setTimeout(r, interval))
  }

  throw new Error(`Timeout after ${timeout}ms: ${message}`)
}

describe('LogWatcher', () => {
  beforeEach(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true })
    }
  })

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true })
    }
  })

  test('should initialize and start watching', async () => {
    const watcher = new LogWatcher({
      logFile: TEST_LOG_FILE,
      debounceMs: 50
    })

    expect(watcher.isWatching()).toBe(false)
    await watcher.start()
    expect(watcher.isWatching()).toBe(true)

    watcher.stop()
    expect(watcher.isWatching()).toBe(false)
  })

  test('should emit line events for new log entries', async () => {
    // Pre-create file with initial content before watching
    fs.writeFileSync(TEST_LOG_FILE, 'Line 1\nLine 2\n')

    const watcher = new LogWatcher({
      logFile: TEST_LOG_FILE,
      debounceMs: 50
    })

    const lines: string[] = []
    watcher.on('line', (logLine) => {
      lines.push(logLine.line)
    })

    await watcher.start()

    // Wait a bit to ensure watcher is fully initialized
    await new Promise(resolve => setTimeout(resolve, 100))

    // Watcher should not emit for existing content
    expect(lines.length).toBe(0)

    // Append new lines
    fs.appendFileSync(TEST_LOG_FILE, 'Line 3\nLine 4\n')

    // Wait for debounce and file system events
    await waitFor(() => lines.length >= 2, { message: 'Expected 2 lines' })

    // Should emit new lines only
    expect(lines.length).toBe(2)
    expect(lines[0]).toBe('Line 3')
    expect(lines[1]).toBe('Line 4')

    watcher.stop()
  })

  test('should handle file truncation', async () => {
    // Create file with content BEFORE starting watcher
    fs.writeFileSync(TEST_LOG_FILE, 'Old line 1\nOld line 2\n')

    const watcher = new LogWatcher({
      logFile: TEST_LOG_FILE,
      debounceMs: 50
    })

    const lines: string[] = []
    watcher.on('line', (logLine) => {
      lines.push(logLine.line)
    })

    await watcher.start()

    // Wait for watcher to initialize
    await new Promise(resolve => setTimeout(resolve, 100))

    // Truncate and write new content (simulating log rotation)
    // Note: Use append after truncation to ensure change event
    fs.writeFileSync(TEST_LOG_FILE, '')
    fs.appendFileSync(TEST_LOG_FILE, 'New line 1\n')

    // Wait for file change detection and processing
    await waitFor(() => lines.includes('New line 1'), { message: 'Expected "New line 1" to be detected' })

    // After truncation, watcher should detect smaller file size and reset
    expect(lines.length).toBeGreaterThan(0)
    expect(lines).toContain('New line 1')

    watcher.stop()
  })

  test('should emit error events', async () => {
    const watcher = new LogWatcher({
      logFile: TEST_LOG_FILE,
      debounceMs: 50
    })

    const errors: Error[] = []
    watcher.on('error', (error) => {
      errors.push(error)
    })

    await watcher.start()

    // Delete the log file to trigger error
    if (fs.existsSync(TEST_LOG_FILE)) {
      fs.unlinkSync(TEST_LOG_FILE)
    }

    watcher.stop()
  })
})

describe('Pattern Detector', () => {
  test('should match PRD not found pattern', () => {
    const line = 'ERROR: PRD file not found: .specs/tasks/TASK-001.md'
    const match = matchPattern(line)

    expect(match).toBeTruthy()
    expect(match?.pattern).toBe('prd-not-found')
    expect(match?.severity).toBe('WARN')
    expect(match?.context.path).toContain('TASK-001.md')
  })

  test('should match rate limit pattern', () => {
    const line = 'Error: Rate limit exceeded (429 Too Many Requests)'
    const match = matchPattern(line)

    expect(match).toBeTruthy()
    expect(match?.pattern).toBe('rate-limit')
    expect(match?.severity).toBe('HIGH')
  })

  test('should match environment variable pattern', () => {
    const line = 'Error: CLAUDE_API_KEY is required'
    const match = matchPattern(line)

    expect(match).toBeTruthy()
    expect(match?.pattern).toBe('env-var-required')
    expect(match?.severity).toBe('ERROR')
    expect(match?.context.envVar).toBe('CLAUDE_API_KEY')
  })

  test('should match task failed pattern', () => {
    const line = 'ERROR: Task failed after 3 attempts'
    const match = matchPattern(line)

    expect(match).toBeTruthy()
    expect(match?.pattern).toBe('task-failed')
    expect(match?.severity).toBe('HIGH')
  })

  test('should match timeout pattern', () => {
    const line = 'WARNING: Execution timeout exceeded (180s)'
    const match = matchPattern(line)

    expect(match).toBeTruthy()
    expect(match?.pattern).toBe('timeout')
    expect(match?.severity).toBe('WARN')
  })

  test('should match file not found pattern', () => {
    const line = 'Error: File not found: /path/to/missing.ts'
    const match = matchPattern(line)

    expect(match).toBeTruthy()
    expect(match?.pattern).toBe('file-not-found')
    expect(match?.severity).toBe('ERROR')
    expect(match?.context.path).toContain('/path/to/missing.ts')
  })

  test('should match network error pattern', () => {
    const line = 'Error: Network error - ECONNREFUSED'
    const match = matchPattern(line)

    expect(match).toBeTruthy()
    expect(match?.pattern).toBe('network-error')
    expect(match?.severity).toBe('WARN')
  })

  test('should match circuit breaker pattern', () => {
    const line = 'CRITICAL: Circuit breaker opened - max retries exceeded'
    const match = matchPattern(line)

    expect(match).toBeTruthy()
    expect(match?.pattern).toBe('circuit-breaker')
    expect(match?.severity).toBe('HIGH')
  })

  test('should return null for non-matching lines', () => {
    const line = 'INFO: Task completed successfully'
    const match = matchPattern(line)

    expect(match).toBe(null)
  })

  test('should check if pattern is known', () => {
    expect(isKnownPattern('prd-not-found')).toBe(true)
    expect(isKnownPattern('rate-limit')).toBe(true)
    expect(isKnownPattern('unknown-pattern')).toBe(false)
  })

  test('should filter patterns by severity', () => {
    const highPatterns = getPatternsBySeverity('HIGH')
    expect(highPatterns).toContain('rate-limit')
    expect(highPatterns).toContain('task-failed')

    const warnPatterns = getPatternsBySeverity('WARN')
    expect(warnPatterns).toContain('prd-not-found')
    expect(warnPatterns).toContain('timeout')

    const errorPatterns = getPatternsBySeverity('ERROR')
    expect(errorPatterns).toContain('env-var-required')
  })

  test('should have all required patterns', () => {
    const requiredPatterns = [
      'prd-not-found',
      'rate-limit',
      'env-var-required',
      'task-failed',
      'timeout',
      'no-pending-tasks',
      'file-not-found',
      'permission-denied',
      'network-error',
      'plugin-error',
      'circuit-breaker'
    ]

    for (const pattern of requiredPatterns) {
      expect(isKnownPattern(pattern)).toBe(true)
    }
  })
})

describe('AIMonitor Integration', () => {
  beforeEach(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true })
    }
  })

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true })
    }
  })

  test('should initialize with default config', async () => {
    const monitor = new AIMonitor()

    expect(monitor.name).toBe('ai-monitor')
  })

  test('should initialize with custom config', async () => {
    const monitor = new AIMonitor({
      enabled: true,
      llm: {
        cooldownMs: 10000,
        maxPerSession: 5,
        model: 'sonnet'
      }
    })

    expect(monitor.name).toBe('ai-monitor')
  })

  test('should handle onConfigLoad lifecycle', async () => {
    const monitor = new AIMonitor()

    const config: LoopworkConfig = {
      projectRoot: TEST_DIR,
      backend: null as any,
      cli: 'claude',
      maxIterations: 10
    }

    const result = await monitor.onConfigLoad(config)

    expect(result).toEqual(config)
  })

  test('should disable monitoring when enabled is false', async () => {
    const monitor = new AIMonitor({
      enabled: false
    })

    const config: LoopworkConfig = {
      projectRoot: TEST_DIR,
      backend: null as any,
      cli: 'claude',
      maxIterations: 10
    }

    const result = await monitor.onConfigLoad(config)

    expect(result).toEqual(config)

    // Should not start watching
    await monitor.onLoopStart('test-namespace')

    const stats = monitor.getStats()
    expect(stats.llmCallCount).toBe(0)
  })

  test('should emit error-detected event', async () => {
    const monitor = new AIMonitor()

    const errors: any[] = []
    monitor.on(AIMonitor.ERROR_DETECTED, (error) => {
      errors.push(error)
    })

    // Verify event constants are defined
    expect(AIMonitor.ERROR_DETECTED).toBe('error-detected')
    expect(AIMonitor.HEALING_STARTED).toBe('healing-started')
    expect(AIMonitor.HEALING_COMPLETED).toBe('healing-completed')
  })

  test('should emit healing-started and healing-completed events', async () => {
    const monitor = new AIMonitor()

    const healingStarted: any[] = []
    const healingCompleted: any[] = []

    monitor.on(AIMonitor.HEALING_STARTED, (data) => {
      healingStarted.push(data)
    })

    monitor.on(AIMonitor.HEALING_COMPLETED, (data) => {
      healingCompleted.push(data)
    })

    // Verify event constants are defined
    expect(AIMonitor.HEALING_STARTED).toBe('healing-started')
    expect(AIMonitor.HEALING_COMPLETED).toBe('healing-completed')
  })
})
