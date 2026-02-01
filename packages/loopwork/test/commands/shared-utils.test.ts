import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import fs from 'fs'
import path from 'path'

/**
 * Tests for shared utilities - process-utils and log-utils
 * These tests are isolated from any mocks to test the actual implementations.
 */

import { saveRestartArgs, loadRestartArgs, clearRestartArgs, formatUptime, formatDuration, isProcessAlive, parseNamespace, findProjectRoot,  } from '../../src/commands/shared/process-utils'

import { findLatestSession, getSessionLogs, readLastLines, listSessions,  } from '../../src/commands/shared/log-utils'

describe('Process Utils', () => {
  const testDir = path.join('/tmp', 'loopwork-process-utils-test-' + Date.now())

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
    fs.mkdirSync(testDir, { recursive: true })
    fs.writeFileSync(path.join(testDir, 'package.json'), '{}')
  })

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
  })

  describe('saveRestartArgs / loadRestartArgs', () => {
    test('saves and loads restart args correctly', () => {
      const args = ['--feature', 'test', '--cli', 'claude']

      // Write restart args directly (avoiding process.cwd() issue in test env)
      const stateDir = path.join(testDir, '.loopwork')
      fs.mkdirSync(stateDir, { recursive: true })
      const argsFile = path.join(stateDir, 'test-ns-restart-args.json')
      const restartArgs = {
        namespace: 'test-ns',
        args,
        cwd: testDir,
        startedAt: new Date().toISOString(),
      }
      fs.writeFileSync(argsFile, JSON.stringify(restartArgs, null, 2))

      const loaded = loadRestartArgs(testDir, 'test-ns')

      expect(loaded).not.toBeNull()
      expect(loaded?.namespace).toBe('test-ns')
      expect(loaded?.args).toEqual(args)
      expect(loaded?.cwd).toBe(testDir)
    })

    test('returns null when no args saved', () => {
      const loaded = loadRestartArgs(testDir, 'nonexistent')
      expect(loaded).toBeNull()
    })

    test('clearRestartArgs removes saved args', () => {
      // Setup: write args directly
      const stateDir = path.join(testDir, '.loopwork')
      fs.mkdirSync(stateDir, { recursive: true })
      const argsFile = path.join(stateDir, 'to-clear-restart-args.json')
      fs.writeFileSync(argsFile, JSON.stringify({
        namespace: 'to-clear',
        args: ['--debug'],
        cwd: testDir,
        startedAt: new Date().toISOString(),
      }, null, 2))

      expect(loadRestartArgs(testDir, 'to-clear')).not.toBeNull()

      clearRestartArgs(testDir, 'to-clear')
      expect(loadRestartArgs(testDir, 'to-clear')).toBeNull()
    })
  })

  describe('formatUptime', () => {
    test('formats seconds correctly', () => {
      const now = new Date()
      const thirtySecondsAgo = new Date(now.getTime() - 30 * 1000)
      const result = formatUptime(thirtySecondsAgo)
      expect(result).toMatch(/^\d+s$/)
    })

    test('formats minutes correctly', () => {
      const now = new Date()
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)
      const result = formatUptime(fiveMinutesAgo)
      expect(result).toMatch(/^\d+m \d+s$/)
    })

    test('formats hours correctly', () => {
      const now = new Date()
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)
      const result = formatUptime(twoHoursAgo)
      expect(result).toMatch(/^\d+h \d+m$/)
    })

    test('formats days correctly', () => {
      const now = new Date()
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
      const result = formatUptime(threeDaysAgo)
      expect(result).toMatch(/^\d+d \d+h$/)
    })

    test('handles string dates', () => {
      const now = new Date()
      const oneMinuteAgo = new Date(now.getTime() - 60 * 1000).toISOString()
      const result = formatUptime(oneMinuteAgo)
      expect(result).toMatch(/m.*s/)
    })
  })

  describe('formatDuration', () => {
    test('formats milliseconds to seconds', () => {
      expect(formatDuration(5000)).toBe('5s')
    })

    test('formats to minutes and seconds', () => {
      expect(formatDuration(125000)).toBe('2m 5s')
    })

    test('formats to hours, minutes, and seconds', () => {
      expect(formatDuration(3725000)).toBe('1h 2m 5s')
    })
  })

  describe('isProcessAlive', () => {
    test('returns true for current process', () => {
      expect(isProcessAlive(process.pid)).toBe(true)
    })

    test('returns false for non-existent process', () => {
      // Use a very high PID that's unlikely to exist
      expect(isProcessAlive(999999999)).toBe(false)
    })
  })

  describe('parseNamespace', () => {
    test('extracts namespace from args', () => {
      expect(parseNamespace(['--namespace', 'myns', '--debug'])).toBe('myns')
    })

    test('returns default when no namespace', () => {
      expect(parseNamespace(['--debug', '--feature', 'auth'])).toBe('default')
    })
  })

  describe('findProjectRoot', () => {
    test('finds project root with package.json from explicit start dir', () => {
      // Use explicit start directory to avoid process.cwd() issues in test env
      const root = findProjectRoot(testDir)
      // Handle macOS symlink /tmp -> /private/tmp
      const normalizedRoot = fs.realpathSync(root)
      const normalizedTestDir = fs.realpathSync(testDir)
      expect(normalizedRoot).toBe(normalizedTestDir)
    })

    test('finds project root with .git from explicit start dir', () => {
      const gitDir = path.join(testDir, '.git')
      fs.mkdirSync(gitDir)

      const root = findProjectRoot(testDir)
      // Handle macOS symlink /tmp -> /private/tmp
      const normalizedRoot = fs.realpathSync(root)
      const normalizedTestDir = fs.realpathSync(testDir)
      expect(normalizedRoot).toBe(normalizedTestDir)
    })

    test('walks up directory tree to find project root', () => {
      // Create nested dir structure
      const nestedDir = path.join(testDir, 'src', 'lib', 'utils')
      fs.mkdirSync(nestedDir, { recursive: true })

      const root = findProjectRoot(nestedDir)
      // Should find testDir which has package.json
      const normalizedRoot = fs.realpathSync(root)
      const normalizedTestDir = fs.realpathSync(testDir)
      expect(normalizedRoot).toBe(normalizedTestDir)
    })
  })
})

describe('Log Utils', () => {
  const testDir = path.join('/tmp', 'loopwork-log-utils-test-' + Date.now())

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
    fs.mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
  })

  describe('findLatestSession', () => {
    test('returns null when no sessions exist', () => {
      const result = findLatestSession(testDir, 'nonexistent')
      expect(result).toBeNull()
    })

    test('finds latest session by timestamp', () => {
      const runsDir = path.join(testDir, '.loopwork/runs', 'test')
      fs.mkdirSync(path.join(runsDir, '2025-01-20T10-00-00'), { recursive: true })
      fs.mkdirSync(path.join(runsDir, '2025-01-25T15-30-00'), { recursive: true })
      fs.mkdirSync(path.join(runsDir, '2025-01-22T08-00-00'), { recursive: true })

      const result = findLatestSession(testDir, 'test')

      expect(result).not.toBeNull()
      expect(result?.timestamp).toBe('2025-01-25T15-30-00')
      expect(result?.namespace).toBe('test')
    })

    test('ignores monitor-logs directory', () => {
      const runsDir = path.join(testDir, '.loopwork/runs', 'test')
      fs.mkdirSync(path.join(runsDir, 'monitor-logs'), { recursive: true })
      fs.mkdirSync(path.join(runsDir, '2025-01-20T10-00-00'), { recursive: true })

      const result = findLatestSession(testDir, 'test')

      expect(result).not.toBeNull()
      expect(result?.timestamp).toBe('2025-01-20T10-00-00')
    })
  })

  describe('getSessionLogs', () => {
    test('returns empty array when no logs directory', () => {
      const sessionPath = path.join(testDir, 'session')
      fs.mkdirSync(sessionPath, { recursive: true })

      const result = getSessionLogs(sessionPath)
      expect(result).toEqual([])
    })

    test('returns log files sorted', () => {
      const sessionPath = path.join(testDir, 'session')
      const logsDir = path.join(sessionPath, 'logs')
      fs.mkdirSync(logsDir, { recursive: true })

      fs.writeFileSync(path.join(logsDir, 'iteration-1-output.txt'), 'log 1')
      fs.writeFileSync(path.join(logsDir, 'iteration-2-output.txt'), 'log 2')
      fs.writeFileSync(path.join(logsDir, 'loopwork.log'), 'main log')

      const result = getSessionLogs(sessionPath)

      expect(result.length).toBe(3)
      expect(result.some(f => f.includes('iteration-1-output.txt'))).toBe(true)
      expect(result.some(f => f.includes('loopwork.log'))).toBe(true)
    })
  })

  describe('getTaskLogs', () => {
    test('returns null for nonexistent logs', () => {
      const result = getTaskLogs(testDir, 99)
      expect(result.prompt).toBeNull()
      expect(result.output).toBeNull()
    })

    test('returns prompt and output when they exist', () => {
      const logsDir = path.join(testDir, 'logs')
      fs.mkdirSync(logsDir, { recursive: true })

      fs.writeFileSync(path.join(logsDir, 'iteration-5-prompt.md'), '# Task prompt')
      fs.writeFileSync(path.join(logsDir, 'iteration-5-output.txt'), 'Task output')

      const result = getTaskLogs(testDir, 5)

      expect(result.prompt).toBe('# Task prompt')
      expect(result.output).toBe('Task output')
    })
  })

  describe('readLastLines', () => {
    test('returns empty array for nonexistent file', () => {
      const result = readLastLines(path.join(testDir, 'nonexistent.txt'))
      expect(result).toEqual([])
    })

    test('returns last N lines', () => {
      const filePath = path.join(testDir, 'test.log')
      fs.writeFileSync(filePath, 'line1\nline2\nline3\nline4\nline5\n')

      const result = readLastLines(filePath, 3)

      expect(result.length).toBe(3)
      expect(result).toContain('line4')
      expect(result).toContain('line5')
    })

    test('returns all lines when fewer than N', () => {
      const filePath = path.join(testDir, 'short.log')
      fs.writeFileSync(filePath, 'a\nb\n')

      const result = readLastLines(filePath, 10)

      expect(result.length).toBe(3) // Including empty line at end
    })
  })

  describe('listSessions', () => {
    test('returns empty array when no sessions', () => {
      const result = listSessions(testDir, 'empty')
      expect(result).toEqual([])
    })

    test('returns sessions sorted by date descending', () => {
      const runsDir = path.join(testDir, '.loopwork/runs', 'multi')
      fs.mkdirSync(path.join(runsDir, '2025-01-10T10-00-00'), { recursive: true })
      fs.mkdirSync(path.join(runsDir, '2025-01-15T10-00-00'), { recursive: true })
      fs.mkdirSync(path.join(runsDir, '2025-01-12T10-00-00'), { recursive: true })

      const result = listSessions(testDir, 'multi')

      expect(result.length).toBe(3)
      expect(result[0].timestamp).toBe('2025-01-15T10-00-00')
      expect(result[1].timestamp).toBe('2025-01-12T10-00-00')
      expect(result[2].timestamp).toBe('2025-01-10T10-00-00')
    })
  })
})
