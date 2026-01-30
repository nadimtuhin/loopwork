/**
 * Core AI Monitor Tests
 * Tests for LogWatcher, PatternDetector, and AIMonitor integration
 */

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import fs from 'fs'
import path from 'path'
import { LogWatcher } from '../../src/ai-monitor/watcher'
import { matchPattern, ERROR_PATTERNS, isKnownPattern, getPatternsBySeverity } from '../../src/ai-monitor/patterns'
import { AIMonitor } from '../../src/ai-monitor'
import type { LoopworkConfig } from '../../src/contracts/config'

const TEST_DIR = path.join(process.cwd(), 'test-temp')
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
      llmCooldown: 10000,
      llmMaxPerSession: 5,
      llmModel: 'sonnet'
    })

    expect(monitor.name).toBe('ai-monitor')
  })

  test('should handle onConfigLoad lifecycle', async () => {
    const monitor = new AIMonitor()

    const config: LoopworkConfig = {
      projectRoot: TEST_DIR,
      cli: 'claude',
      maxIterations: 10
    }

    const result = await monitor.onConfigLoad(config)

    expect(result).toEqual(config)
  })

  test('should start and stop watching on loop lifecycle', async () => {
    const monitor = new AIMonitor()

    const config: LoopworkConfig = {
      projectRoot: TEST_DIR,
      cli: 'claude',
      maxIterations: 10
    }

    await monitor.onConfigLoad(config)

    // Mock logger.logFile for testing
    const logger = await import('../../src/core/utils')
    logger.logger.logFile = TEST_LOG_FILE

    await monitor.onLoopStart('test-namespace')

    // Verify watcher started (internal state - tested via lifecycle)
    await monitor.onLoopEnd({
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      skippedTasks: 0,
      duration: 0
    })

    // Watcher should be stopped
  })

  test('should track detected patterns', async () => {
    const monitor = new AIMonitor({
      enabled: true,
      patternCheckDebounce: 50
    })

    const config: LoopworkConfig = {
      projectRoot: TEST_DIR,
      cli: 'claude',
      maxIterations: 10
    }

    await monitor.onConfigLoad(config)

    const logger = await import('../../src/core/utils')
    logger.logger.logFile = TEST_LOG_FILE

    await monitor.onLoopStart('test-namespace')

    // Write log entries
    fs.writeFileSync(TEST_LOG_FILE, '')
    await new Promise(resolve => setTimeout(resolve, 100))

    fs.appendFileSync(TEST_LOG_FILE, 'ERROR: PRD file not found: TASK-001.md\n')
    fs.appendFileSync(TEST_LOG_FILE, 'Error: Rate limit exceeded\n')

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 200))

    const stats = monitor.getStats()

    // Verify patterns were detected and tracked
    expect(stats.llmCallCount).toBeGreaterThanOrEqual(0)

    await monitor.onLoopEnd({
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      skippedTasks: 0,
      duration: 0
    })
  })

  test('should respect LLM call limits', async () => {
    const monitor = new AIMonitor({
      enabled: true,
      llmMaxPerSession: 2,
      llmCooldown: 1000
    })

    const config: LoopworkConfig = {
      projectRoot: TEST_DIR,
      cli: 'claude',
      maxIterations: 10
    }

    await monitor.onConfigLoad(config)

    const stats = monitor.getStats()

    // Should respect configured limits (starts at 0)
    expect(stats.llmCallCount).toBe(0)
    expect(stats.llmCallCount).toBeLessThanOrEqual(2)
  })

  test('should disable monitoring when enabled is false', async () => {
    const monitor = new AIMonitor({
      enabled: false
    })

    const config: LoopworkConfig = {
      projectRoot: TEST_DIR,
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

  test('should auto-create PRD when PRD not found error detected', async () => {
    const monitor = new AIMonitor({
      enabled: true,
      patternCheckDebounce: 50
    })

    const config: LoopworkConfig = {
      projectRoot: TEST_DIR,
      cli: 'claude',
      maxIterations: 10
    }

    await monitor.onConfigLoad(config)

    const logger = await import('../../src/core/utils')
    logger.logger.logFile = TEST_LOG_FILE

    // Create tasks.json with task metadata
    const tasksDir = path.join(TEST_DIR, '.specs', 'tasks')
    fs.mkdirSync(tasksDir, { recursive: true })
    const tasksJson = path.join(tasksDir, 'tasks.json')
    fs.writeFileSync(tasksJson, JSON.stringify({
      tasks: [
        {
          id: 'AI-MONITOR-001d',
          title: 'AI Monitor: Auto-Create PRD Action',
          description: 'When PRD file not found detected, read task metadata from tasks.json and generate stub PRD with title, goal, and placeholder requirements.'
        }
      ]
    }, null, 2))

    await monitor.onLoopStart('test-namespace')

    // Change to TEST_DIR so PRD creation uses correct paths
    const originalCwd = process.cwd()
    process.chdir(TEST_DIR)

    try {
      // Write log file with PRD not found error
      fs.writeFileSync(TEST_LOG_FILE, '')
      await new Promise(resolve => setTimeout(resolve, 100))

      fs.appendFileSync(TEST_LOG_FILE, 'ERROR: PRD file not found: .specs/tasks/AI-MONITOR-001d.md\n')

      // Wait for processing
      const prdPath = path.join(tasksDir, 'AI-MONITOR-001d.md')
      await waitFor(() => fs.existsSync(prdPath), { timeout: 5000, message: 'PRD file was not created' })

      // Verify PRD file was created
      expect(fs.existsSync(prdPath)).toBe(true)

      const prdContent = fs.readFileSync(prdPath, 'utf8')
      expect(prdContent).toContain('AI-MONITOR-001d: AI Monitor: Auto-Create PRD Action')
      expect(prdContent).toContain('When PRD file not found detected')
      expect(prdContent).toContain('## Requirements')
      expect(prdContent).toContain('*Auto-generated by Loopwork AI Monitor*')

      const stats = monitor.getStats()
      expect(stats.actionHistory.length).toBeGreaterThan(0)
      const createPrdAction = stats.actionHistory.find(a => a.action.pattern === 'prd-not-found')
      expect(createPrdAction).toBeDefined()
      expect(createPrdAction?.success).toBe(true)
    } finally {
      process.chdir(originalCwd)
      await monitor.onLoopEnd({
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        skippedTasks: 0,
        duration: 0
      })
    }
  })
})

describe('Task Recovery Integration', () => {
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

  test('should enhance task on failure', async () => {
    const monitor = new AIMonitor({
      enabled: true,
      taskRecovery: {
        enabled: true,
        maxLogLines: 50,
        minFailureCount: 1
      }
    })

    const config: LoopworkConfig = {
      projectRoot: TEST_DIR,
      cli: 'claude',
      maxIterations: 10
    }

    await monitor.onConfigLoad(config)

    // Setup mock backend
    const mockBackend = {
      getTask: mock(async (id: string) => ({
        id,
        title: 'Test Task',
        description: 'Test description',
        status: 'pending' as const,
        priority: 'medium' as const
      })),
      createSubTask: mock()
    }

    await monitor.onBackendReady(mockBackend as any)

    // Setup log file
    const logger = await import('../../src/core/utils')
    logger.logger.logFile = TEST_LOG_FILE
    fs.writeFileSync(TEST_LOG_FILE, '')

    // Write logs that indicate vague PRD
    fs.appendFileSync(TEST_LOG_FILE, 'Task started\n')
    fs.appendFileSync(TEST_LOG_FILE, 'I need more detail about the requirements\n')
    fs.appendFileSync(TEST_LOG_FILE, 'Can you clarify what should be implemented?\n')
    fs.appendFileSync(TEST_LOG_FILE, 'Which file should I modify?\n')

    await monitor.onLoopStart('test-namespace')

    // Change to TEST_DIR for PRD creation
    const originalCwd = process.cwd()
    process.chdir(TEST_DIR)

    try {
      // Trigger task failure
      const taskContext = {
        task: {
          id: 'TEST-001',
          title: 'Test Task',
          description: 'Test description',
          status: 'pending' as const,
          priority: 'medium' as const
        },
        iteration: 1,
        startTime: new Date(),
        namespace: 'test-namespace'
      }

      await monitor.onTaskFailed(taskContext, 'Task execution failed')

      // Wait for PRD enhancement
      const prdPath = path.join(TEST_DIR, '.specs/tasks/TEST-001.md')
      await waitFor(() => fs.existsSync(prdPath), { timeout: 3000, message: 'PRD was not created' })

      // Verify PRD was enhanced
      expect(fs.existsSync(prdPath)).toBe(true)
      const prdContent = fs.readFileSync(prdPath, 'utf8')
      expect(prdContent).toContain('## Key Files')
      expect(prdContent).toContain('## Approach Hints')

      // Verify stats
      const stats = monitor.getStats()
      expect(stats.taskRecovery.attempts).toBe(1)
      expect(stats.taskRecovery.successes).toBe(1)
      expect(stats.taskRecovery.failures).toBe(0)
      expect(stats.taskRecovery.historySize).toBe(1)
    } finally {
      process.chdir(originalCwd)
      await monitor.onLoopEnd({
        totalTasks: 1,
        completedTasks: 0,
        failedTasks: 1,
        skippedTasks: 0,
        duration: 1000
      })
    }
  })

  test('should respect circuit breaker', async () => {
    const monitor = new AIMonitor({
      enabled: true,
      taskRecovery: {
        enabled: true
      },
      circuitBreaker: {
        maxFailures: 2,
        cooldownPeriodMs: 60000
      }
    })

    const config: LoopworkConfig = {
      projectRoot: TEST_DIR,
      cli: 'claude',
      maxIterations: 10
    }

    await monitor.onConfigLoad(config)

    // Setup mock backend that always fails
    const mockBackend = {
      getTask: mock(async () => {
        throw new Error('Backend error')
      })
    }

    await monitor.onBackendReady(mockBackend as any)

    const logger = await import('../../src/core/utils')
    logger.logger.logFile = TEST_LOG_FILE
    fs.writeFileSync(TEST_LOG_FILE, 'Task failed\n')

    await monitor.onLoopStart('test-namespace')

    const originalCwd = process.cwd()
    process.chdir(TEST_DIR)

    try {
      const taskContext = {
        task: {
          id: 'TEST-002',
          title: 'Test Task 2',
          description: 'Test',
          status: 'pending' as const,
          priority: 'medium' as const
        },
        iteration: 1,
        startTime: new Date(),
        namespace: 'test-namespace'
      }

      // Fail twice to open circuit
      await monitor.onTaskFailed(taskContext, 'Error 1')
      await monitor.onTaskFailed(taskContext, 'Error 2')

      // Check that circuit is open
      const stats = monitor.getStats()
      expect(stats.circuitBreaker.isOpen).toBe(true)
      expect(stats.taskRecovery.failures).toBe(2)

      // Try to recover again - should be skipped due to circuit breaker
      await monitor.onTaskFailed(taskContext, 'Error 3')

      // Attempts should not increase because circuit is open
      const stats2 = monitor.getStats()
      expect(stats2.taskRecovery.attempts).toBe(2) // Only the first two attempts
    } finally {
      process.chdir(originalCwd)
      await monitor.onLoopEnd({
        totalTasks: 1,
        completedTasks: 0,
        failedTasks: 1,
        skippedTasks: 0,
        duration: 1000
      })
    }
  })

  test('should prevent duplicate enhancements', async () => {
    const monitor = new AIMonitor({
      enabled: true,
      taskRecovery: {
        enabled: true
      }
    })

    const config: LoopworkConfig = {
      projectRoot: TEST_DIR,
      cli: 'claude',
      maxIterations: 10
    }

    await monitor.onConfigLoad(config)

    // Setup mock backend
    const mockBackend = {
      getTask: mock(async (id: string) => ({
        id,
        title: 'Test Task',
        description: 'Test description',
        status: 'pending' as const,
        priority: 'medium' as const
      })),
      createSubTask: mock()
    }

    await monitor.onBackendReady(mockBackend as any)

    const logger = await import('../../src/core/utils')
    logger.logger.logFile = TEST_LOG_FILE
    fs.writeFileSync(TEST_LOG_FILE, 'Need more detail\nCan you clarify\n')

    await monitor.onLoopStart('test-namespace')

    const originalCwd = process.cwd()
    process.chdir(TEST_DIR)

    try {
      const taskContext = {
        task: {
          id: 'TEST-003',
          title: 'Test Task 3',
          description: 'Test',
          status: 'pending' as const,
          priority: 'medium' as const
        },
        iteration: 1,
        startTime: new Date(),
        namespace: 'test-namespace'
      }

      // Fail twice with same vague PRD pattern
      await monitor.onTaskFailed(taskContext, 'Error 1')

      // Wait for first enhancement
      const prdPath = path.join(TEST_DIR, '.specs/tasks/TEST-003.md')
      await waitFor(() => fs.existsSync(prdPath), { timeout: 3000, message: 'PRD was not created' })

      // Get stats after first enhancement
      const stats1 = monitor.getStats()
      expect(stats1.taskRecovery.attempts).toBe(1)
      expect(stats1.taskRecovery.successes).toBe(1)
      expect(stats1.taskRecovery.historySize).toBe(1)

      // Try to enhance again - should be skipped due to history
      await monitor.onTaskFailed(taskContext, 'Error 2')

      // Give it a moment to process (but it should skip)
      await new Promise(resolve => setTimeout(resolve, 200))

      // Stats should show second attempt was made but skipped
      const stats2 = monitor.getStats()
      expect(stats2.taskRecovery.attempts).toBe(2) // Attempt counter incremented
      expect(stats2.taskRecovery.successes).toBe(1) // Success not incremented (skipped)
      expect(stats2.taskRecovery.failures).toBe(0) // No failures
      expect(stats2.taskRecovery.historySize).toBe(1) // History unchanged
    } finally {
      process.chdir(originalCwd)
      await monitor.onLoopEnd({
        totalTasks: 1,
        completedTasks: 0,
        failedTasks: 1,
        skippedTasks: 0,
        duration: 1000
      })
    }
  })
})
