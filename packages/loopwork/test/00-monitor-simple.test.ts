import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { LoopworkMonitor } from '../src/monitor/index'

/**
 * Simple integration tests for LoopworkMonitor
 *
 * Coverage target: src/monitor/index.ts (56.65% -> 65%+)
 *
 * Focuses on state management and CLI commands without spawning processes
 */

describe('LoopworkMonitor Simple Integration', () => {
  let tempDir: string
  let monitor: LoopworkMonitor

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loopwork-monitor-simple-'))
    monitor = new LoopworkMonitor(tempDir)
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('State file management', () => {
    test('creates initial empty state', () => {
      const running = monitor.getRunningProcesses()
      expect(running).toEqual([])
    })

    test('persists state to file system', () => {
      const stateDir = path.join(tempDir, '.loopwork')
      fs.mkdirSync(stateDir, { recursive: true })
      const stateFile = path.join(stateDir, 'monitor-state.json')

      // Write a state directly
      const state = {
        processes: [{
          namespace: 'test',
          pid: process.pid,
          startedAt: new Date().toISOString(),
          logFile: '/tmp/test.log',
          args: []
        }]
      }
      fs.writeFileSync(stateFile, JSON.stringify(state))

      // Create new monitor and load state
      const monitor2 = new LoopworkMonitor(tempDir)
      const running = monitor2.getRunningProcesses()

      expect(running).toHaveLength(1)
      expect(running[0].namespace).toBe('test')
    })

    test('handles missing state file', () => {
      const running = monitor.getRunningProcesses()
      expect(running).toEqual([])
    })
  })

  describe('Namespace operations', () => {
    test('prevents duplicate namespace registration', async () => {
      const stateDir = path.join(tempDir, '.loopwork')
      fs.mkdirSync(stateDir, { recursive: true })
      const stateFile = path.join(stateDir, 'monitor-state.json')
      const state = {
        processes: [{
          namespace: 'existing',
          pid: process.pid,
          startedAt: new Date().toISOString(),
          logFile: '/tmp/test.log',
          args: []
        }]
      }
      fs.writeFileSync(stateFile, JSON.stringify(state))

      const result = await monitor.start('existing', [])
      expect(result.success).toBe(false)
      expect(result.error).toContain('already running')
    })

    test('stop returns error for non-existent namespace', () => {
      const result = monitor.stop('nonexistent')
      expect(result.success).toBe(false)
      expect(result.error).toContain('No running loop found')
    })

    test('stopAll with no running processes', () => {
      const results = monitor.stopAll()
      expect(results.stopped).toEqual([])
      expect(results.errors).toEqual([])
    })
  })

  describe('Log retrieval', () => {
    test('getLogs for non-existent namespace', () => {
      const logs = monitor.getLogs('nonexistent')
      expect(Array.isArray(logs)).toBe(true)
      expect(logs[0]).toContain('No logs found')
    })

    test('getLogs reads from log file', () => {
      const logsDir = path.join(tempDir, '.loopwork/runs', 'test', 'monitor-logs')
      fs.mkdirSync(logsDir, { recursive: true })
      const logFile = path.join(logsDir, 'test.log')
      fs.writeFileSync(logFile, 'Line 1\nLine 2\nLine 3\n')

      const stateDir = path.join(tempDir, '.loopwork')
      fs.mkdirSync(stateDir, { recursive: true })
      const stateFile = path.join(stateDir, 'monitor-state.json')
      const state = {
        processes: [{
          namespace: 'test',
          pid: process.pid,
          startedAt: new Date().toISOString(),
          logFile,
          args: []
        }]
      }
      fs.writeFileSync(stateFile, JSON.stringify(state))

      const logs = monitor.getLogs('test')
      expect(Array.isArray(logs)).toBe(true)
      const logStr = logs.join('\n')
      expect(logStr).toContain('Line 1')
      expect(logStr).toContain('Line 2')
    })

    test('getLogs limits line count', () => {
      const logsDir = path.join(tempDir, '.loopwork/runs', 'test', 'monitor-logs')
      fs.mkdirSync(logsDir, { recursive: true })
      const logFile = path.join(logsDir, 'test.log')
      const manyLines = Array.from({ length: 100 }, (_, i) => `Line ${i}`).join('\n')
      fs.writeFileSync(logFile, manyLines)

      const stateDir = path.join(tempDir, '.loopwork')
      fs.mkdirSync(stateDir, { recursive: true })
      const stateFile = path.join(stateDir, 'monitor-state.json')
      const state = {
        processes: [{
          namespace: 'test',
          pid: process.pid,
          startedAt: new Date().toISOString(),
          logFile,
          args: []
        }]
      }
      fs.writeFileSync(stateFile, JSON.stringify(state))

      const logs = monitor.getLogs('test', 10)
      expect(Array.isArray(logs)).toBe(true)
      expect(logs.length).toBeLessThanOrEqual(10)
    })
  })

  describe('Status reporting', () => {
    test('getStatus returns empty when nothing running', () => {
      const status = monitor.getStatus()
      expect(status.running).toEqual([])
      expect(Array.isArray(status.namespaces)).toBe(true)
    })

    test('getStatus lists namespaces', () => {
      const runsDir = path.join(tempDir, '.loopwork/runs')
      fs.mkdirSync(path.join(runsDir, 'namespace-1'), { recursive: true })
      fs.mkdirSync(path.join(runsDir, 'namespace-2'), { recursive: true })

      const status = monitor.getStatus()
      expect(status.namespaces).toHaveLength(2)
      const names = status.namespaces.map(ns => ns.name)
      expect(names).toContain('namespace-1')
      expect(names).toContain('namespace-2')
    })

    test('getStatus shows namespace status', () => {
      const runsDir = path.join(tempDir, '.loopwork/runs')
      fs.mkdirSync(path.join(runsDir, 'stopped-ns'), { recursive: true })

      const status = monitor.getStatus()
      const ns = status.namespaces.find(n => n.name === 'stopped-ns')
      expect(ns).toBeDefined()
      expect(ns!.status).toBe('stopped')
    })

    test('getStatus includes running processes', () => {
      const stateDir = path.join(tempDir, '.loopwork')
      fs.mkdirSync(stateDir, { recursive: true })
      const stateFile = path.join(stateDir, 'monitor-state.json')
      const state = {
        processes: [{
          namespace: 'active',
          pid: process.pid,
          startedAt: new Date().toISOString(),
          logFile: '/tmp/test.log',
          args: []
        }]
      }
      fs.writeFileSync(stateFile, JSON.stringify(state))

      const status = monitor.getStatus()
      expect(status.running).toHaveLength(1)
      expect(status.running[0].namespace).toBe('active')
    })
  })

  describe('Error handling', () => {
    test('handles corrupted state file', () => {
      const stateDir = path.join(tempDir, '.loopwork')
      fs.mkdirSync(stateDir, { recursive: true })
      const stateFile = path.join(stateDir, 'monitor-state.json')
      fs.writeFileSync(stateFile, 'invalid json')

      const running = monitor.getRunningProcesses()
      expect(running).toEqual([])
    })

    test('handles missing log file gracefully', () => {
      const stateDir = path.join(tempDir, '.loopwork')
      fs.mkdirSync(stateDir, { recursive: true })
      const stateFile = path.join(stateDir, 'monitor-state.json')
      const state = {
        processes: [{
          namespace: 'test',
          pid: process.pid,
          startedAt: new Date().toISOString(),
          logFile: '/nonexistent/log.log',
          args: []
        }]
      }
      fs.writeFileSync(stateFile, JSON.stringify(state))

      const logs = monitor.getLogs('test')
      expect(Array.isArray(logs)).toBe(true)
      expect(logs[0]).toContain('No logs found')
    })

    test('handles empty state processes array', () => {
      const stateDir = path.join(tempDir, '.loopwork')
      fs.mkdirSync(stateDir, { recursive: true })
      const stateFile = path.join(stateDir, 'monitor-state.json')
      fs.writeFileSync(stateFile, JSON.stringify({ processes: [] }))

      const running = monitor.getRunningProcesses()
      expect(running).toEqual([])
    })
  })

  describe('Multiple namespaces', () => {
    test('tracks multiple concurrent namespaces', () => {
      const stateDir = path.join(tempDir, '.loopwork')
      fs.mkdirSync(stateDir, { recursive: true })
      const stateFile = path.join(stateDir, 'monitor-state.json')
      const state = {
        processes: [
          {
            namespace: 'ns-1',
            pid: process.pid,
            startedAt: new Date().toISOString(),
            logFile: '/tmp/1.log',
            args: []
          },
          {
            namespace: 'ns-2',
            pid: process.pid + 1,
            startedAt: new Date().toISOString(),
            logFile: '/tmp/2.log',
            args: []
          }
        ]
      }
      fs.writeFileSync(stateFile, JSON.stringify(state))

      const running = monitor.getRunningProcesses()
      expect(running.length).toBeGreaterThanOrEqual(1) // At least one alive (current process)

      const namespaces = running.map(p => p.namespace)
      expect(namespaces.length).toBeGreaterThanOrEqual(1)
    })

    test('stop removes only specific namespace', () => {
      const stateDir = path.join(tempDir, '.loopwork')
      fs.mkdirSync(stateDir, { recursive: true })
      const stateFile = path.join(stateDir, 'monitor-state.json')
      const deadPid = 999999999
      const state = {
        processes: [
          {
            namespace: 'keep',
            pid: process.pid,
            startedAt: new Date().toISOString(),
            logFile: '/tmp/keep.log',
            args: []
          },
          {
            namespace: 'remove',
            pid: deadPid,
            startedAt: new Date().toISOString(),
            logFile: '/tmp/remove.log',
            args: []
          }
        ]
      }
      fs.writeFileSync(stateFile, JSON.stringify(state))

      // Try to stop the dead one (will clean state)
      monitor.stop('remove')

      const running = monitor.getRunningProcesses()
      const namespaces = running.map(p => p.namespace)
      expect(namespaces).toContain('keep')
      expect(namespaces).not.toContain('remove')
    })
  })
})
