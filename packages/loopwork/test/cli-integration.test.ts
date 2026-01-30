import { describe, test, expect } from 'bun:test'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { LoopworkMonitor } from '../src/monitor'
import {
  findLatestSession,
  getMainLogFile,
  readLastLines,
  listSessions,
  getTaskLogs,
} from '../src/commands/shared/log-utils'

describe('CLI Integration: logs and kill workflow', () => {
  const createTestRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'loopwork-cli-integration-'))

  test('complete workflow demonstration', () => {
    const testRoot = createTestRoot()
    // Create test directory
    fs.mkdirSync(testRoot, { recursive: true })

    try {
      // Step 1: Simulate a loopwork session
      const sessionDir = path.join(testRoot, 'loopwork-runs/default/2025-01-25T12-00-00')
      const logFile = path.join(sessionDir, 'loopwork.log')
      fs.mkdirSync(sessionDir, { recursive: true })
      fs.writeFileSync(
        logFile,
        `[2025-01-25 12:00:00] Starting loopwork
[2025-01-25 12:00:01] [INFO] Processing task TASK-001
[2025-01-25 12:00:02] [SUCCESS] Task completed
`
      )

      // Step 2: Use log utilities to read session
      const session = findLatestSession(testRoot, 'default')
      expect(session).not.toBeNull()
      expect(session!.namespace).toBe('default')

      // Step 3: Read log file
      const mainLog = getMainLogFile(session!.fullPath)
      expect(mainLog).not.toBeNull()

      const lines = readLastLines(mainLog!, 10)
      expect(lines.some(l => l.includes('TASK-001'))).toBe(true)

      // Step 4: List all sessions
      const sessions = listSessions(testRoot, 'default')
      expect(sessions.length).toBe(1)

      // Step 5: Test monitor functionality
      const monitor = new LoopworkMonitor(testRoot)
      const { namespaces } = monitor.getStatus()
      expect(namespaces.some(ns => ns.name === 'default')).toBe(true)
    } finally {
      // Cleanup
      if (fs.existsSync(testRoot)) {
        fs.rmSync(testRoot, { recursive: true, force: true })
      }
    }
  })

  test('task-specific logs workflow', () => {
    const testRoot = createTestRoot()
    fs.mkdirSync(testRoot, { recursive: true })

    try {
      const sessionDir = path.join(testRoot, 'loopwork-runs/default/2025-01-25T12-00-00')
      const logsDir = path.join(sessionDir, 'logs')
      fs.mkdirSync(logsDir, { recursive: true })

      // Create task iteration logs
      fs.writeFileSync(
        path.join(logsDir, 'iteration-1-prompt.md'),
        '# Task: TASK-001\n\nImplement feature'
      )
      fs.writeFileSync(
        path.join(logsDir, 'iteration-1-output.txt'),
        'Feature implemented'
      )

      // Read task logs using utility
      const taskLogs = getTaskLogs(sessionDir, 1)
      expect(taskLogs.prompt).toContain('TASK-001')
      expect(taskLogs.output).toContain('Feature implemented')
    } finally {
      if (fs.existsSync(testRoot)) {
        fs.rmSync(testRoot, { recursive: true, force: true })
      }
    }
  })

  test('multiple namespaces workflow', () => {
    const testRoot = createTestRoot()
    fs.mkdirSync(testRoot, { recursive: true })

    try {
      // Create sessions for multiple namespaces
      const namespaces = ['default', 'feature-a', 'feature-b']
      namespaces.forEach(ns => {
        const sessionDir = path.join(testRoot, `loopwork-runs/${ns}/2025-01-25T12-00-00`)
        fs.mkdirSync(sessionDir, { recursive: true })
        fs.writeFileSync(
          path.join(sessionDir, 'loopwork.log'),
          `[2025-01-25 12:00:00] ${ns} running\n`
        )
      })

      // Verify each namespace can be found
      namespaces.forEach(ns => {
        const session = findLatestSession(testRoot, ns)
        expect(session).not.toBeNull()
        expect(session!.namespace).toBe(ns)

        const logFile = getMainLogFile(session!.fullPath)
        const lines = readLastLines(logFile!, 10)
        expect(lines.some(l => l.includes(ns))).toBe(true)
      })

      // Monitor should see all namespaces
      const monitor = new LoopworkMonitor(testRoot)
      const { namespaces: allNs } = monitor.getStatus()
      expect(allNs.length).toBeGreaterThanOrEqual(3)
    } finally {
      if (fs.existsSync(testRoot)) {
        fs.rmSync(testRoot, { recursive: true, force: true })
      }
    }
  })

  test('monitor state management', () => {
    const testRoot = createTestRoot()
    fs.mkdirSync(testRoot, { recursive: true })

    try {
      const monitor = new LoopworkMonitor(testRoot)
      const stateFile = path.join(testRoot, '.loopwork-monitor-state.json')

      // Create mock process state
      const mockState = {
        processes: [
          {
            namespace: 'test',
            pid: 99999,
            startedAt: new Date().toISOString(),
            logFile: '/tmp/test.log',
            args: [],
          },
        ],
      }
      fs.writeFileSync(stateFile, JSON.stringify(mockState))

      // Stop should handle gracefully
      const result = monitor.stop('test')
      expect(result).toHaveProperty('success')

      // StopAll should work
      fs.writeFileSync(stateFile, JSON.stringify(mockState))
      const stopAllResult = monitor.stopAll()
      expect(stopAllResult).toHaveProperty('stopped')
      expect(stopAllResult).toHaveProperty('errors')
    } finally {
      if (fs.existsSync(testRoot)) {
        fs.rmSync(testRoot, { recursive: true, force: true })
      }
    }
  })
})
