import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import fs from 'fs'
import path from 'path'
import { Dashboard } from '../src/dashboard/cli'

describe('Dashboard class implementation', () => {
  let testRoot: string
  let MonitorClass: { new (projectRoot: string): any }

  beforeEach(() => {
    // Create unique test directory for each test
    testRoot = path.join('/tmp', 'loopwork-dashboard-class-test-' + Date.now() + '-' + Math.random().toString(36).substring(7))
    if (fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true })
    }
    fs.mkdirSync(testRoot, { recursive: true })

    class MonitorMock {
      private projectRoot: string
      constructor(projectRoot: string) {
        this.projectRoot = projectRoot
      }
      getRunningProcesses() {
        const stateFile = path.join(this.projectRoot, '.loopwork/monitor-state.json')
        if (fs.existsSync(stateFile)) {
          try {
            const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'))
            return state.processes.filter((p: any) => {
              try {
                process.kill(p.pid, 0)
                return true
              } catch {
                return false
              }
            })
          } catch {
            return []
          }
        }
        return []
      }
      getStatus() {
        const running = this.getRunningProcesses()
        const runsDir = path.join(this.projectRoot, '.loopwork/runs')
        const namespaces: any[] = []

        if (fs.existsSync(runsDir)) {
          const dirs = fs.readdirSync(runsDir, { withFileTypes: true })
            .filter(d => d.isDirectory())

          for (const dir of dirs) {
            const isRunning = running.some((p: any) => p.namespace === dir.name)
            const runDirs = fs.readdirSync(path.join(runsDir, dir.name), { withFileTypes: true })
              .filter(d => d.isDirectory() && d.name !== 'monitor-logs')
              .sort()

            namespaces.push({
              name: dir.name,
              status: isRunning ? 'running' : 'stopped',
              lastRun: runDirs.length > 0 ? runDirs[runDirs.length - 1].name : undefined,
            })
          }
        }

        return { running, namespaces }
      }
    }

    MonitorClass = MonitorMock as any
  })

  afterEach(() => {
    // Clean up
    if (fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true })
    }
  })

  describe('state parsing logic', () => {
    test('parses state file with current task and iteration', () => {
      const stateDir = path.join(testRoot, '.loopwork')
      fs.mkdirSync(stateDir, { recursive: true })
      const stateFile = path.join(stateDir, 'state.json')
      fs.writeFileSync(stateFile, 'LAST_ISSUE=123\nLAST_ITERATION=5\n')

      const dashboard = new Dashboard(testRoot, { MonitorClass })
      const stats = (dashboard as any).getNamespaceStats('default')

      expect(stats.currentTask).toBe('Task #123')
      expect(stats.iterations).toBe(5)
    })

    test('handles missing state file', () => {
      const dashboard = new Dashboard(testRoot, { MonitorClass })
      const stats = (dashboard as any).getNamespaceStats('default')

      expect(stats.currentTask).toBeUndefined()
      expect(stats.iterations).toBe(0)
    })

    test('handles corrupted state file', () => {
      const stateDir = path.join(testRoot, '.loopwork')
      fs.mkdirSync(stateDir, { recursive: true })
      const stateFile = path.join(stateDir, 'state.json')
      fs.writeFileSync(stateFile, 'invalid content without equals')

      const dashboard = new Dashboard(testRoot, { MonitorClass })
      const stats = (dashboard as any).getNamespaceStats('default')

      // Should not crash, just return defaults
      expect(stats.iterations).toBe(0)
    })

    test('parses namespaced state file', () => {
      const stateDir = path.join(testRoot, '.loopwork')
      fs.mkdirSync(stateDir, { recursive: true })
      const stateFile = path.join(stateDir, 'state-custom.json')
      fs.writeFileSync(stateFile, 'LAST_ISSUE=456\nLAST_ITERATION=10\n')

      const dashboard = new Dashboard(testRoot, { MonitorClass })
      const stats = (dashboard as any).getNamespaceStats('custom')

      expect(stats.currentTask).toBe('Task #456')
      expect(stats.iterations).toBe(10)
    })
  })

  describe('uptime calculation', () => {
    test('formats uptime in minutes', () => {
      const dashboard = new Dashboard(testRoot, { MonitorClass })
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      const uptime = (dashboard as any).getUptime(fiveMinutesAgo)

      expect(uptime).toMatch(/5m/)
    })

    test('formats uptime in hours and minutes', () => {
      const dashboard = new Dashboard(testRoot, { MonitorClass })
      const twoHoursAgo = new Date(Date.now() - 2.5 * 60 * 60 * 1000).toISOString()
      const uptime = (dashboard as any).getUptime(twoHoursAgo)

      expect(uptime).toMatch(/2h/)
      expect(uptime).toMatch(/30m/)
    })
  })

  describe('time extraction from logs', () => {
    test('extracts time from log line', () => {
      const dashboard = new Dashboard(testRoot, { MonitorClass })
      const line = '[10:30:45 AM] [INFO] Task started'
      const time = (dashboard as any).extractTime(line)

      expect(time).toBe('10:30:45 AM')
    })

    test('returns empty string for invalid format', () => {
      const dashboard = new Dashboard(testRoot, { MonitorClass })
      const line = 'Invalid log line'
      const time = (dashboard as any).extractTime(line)

      expect(time).toBe('')
    })
  })

  describe('activity parsing', () => {
    test('identifies completed tasks', () => {
      const monitorLogsDir = path.join(testRoot, '.loopwork/runs/default/monitor-logs')
      fs.mkdirSync(monitorLogsDir, { recursive: true })

      const timestamp = new Date().toLocaleTimeString()
      const logContent = `[${timestamp}] [SUCCESS] Task TASK-001 completed successfully\n`
      fs.writeFileSync(path.join(monitorLogsDir, 'latest.log'), logContent)

      const dashboard = new Dashboard(testRoot, { MonitorClass })
      const activity = (dashboard as any).getRecentActivity()

      expect(activity.length).toBeGreaterThan(0)
      expect(activity[0].type).toBe('completed')
    })

    test('identifies failed tasks', () => {
      const monitorLogsDir = path.join(testRoot, '.loopwork/runs/default/monitor-logs')
      fs.mkdirSync(monitorLogsDir, { recursive: true })

      const timestamp = new Date().toLocaleTimeString()
      const logContent = `[${timestamp}] [ERROR] Task TASK-001 failed with error\n`
      fs.writeFileSync(path.join(monitorLogsDir, 'latest.log'), logContent)

      const dashboard = new Dashboard(testRoot, { MonitorClass })
      const activity = (dashboard as any).getRecentActivity()

      expect(activity.length).toBeGreaterThan(0)
      expect(activity[0].type).toBe('failed')
    })

    test('identifies iteration progress', () => {
      const monitorLogsDir = path.join(testRoot, '.loopwork/runs/default/monitor-logs')
      fs.mkdirSync(monitorLogsDir, { recursive: true })

      const timestamp = new Date().toLocaleTimeString()
      const logContent = `[${timestamp}] Iteration 5 started\n`
      fs.writeFileSync(path.join(monitorLogsDir, 'latest.log'), logContent)

      const dashboard = new Dashboard(testRoot, { MonitorClass })
      const activity = (dashboard as any).getRecentActivity()

      expect(activity.length).toBeGreaterThan(0)
      expect(activity[0].type).toBe('progress')
      expect(activity[0].message).toContain('iteration 5')
    })

    test('limits activity to 10 items', () => {
      const monitorLogsDir = path.join(testRoot, '.loopwork/runs/default/monitor-logs')
      fs.mkdirSync(monitorLogsDir, { recursive: true })

      const timestamp = new Date().toLocaleTimeString()
      const logContent = Array(20)
        .fill(0)
        .map((_, i) => `[${timestamp}] [SUCCESS] Task TASK-${i} completed`)
        .join('\n')
      fs.writeFileSync(path.join(monitorLogsDir, 'latest.log'), logContent)

      const dashboard = new Dashboard(testRoot, { MonitorClass })
      const activity = (dashboard as any).getRecentActivity()

      expect(activity.length).toBeLessThanOrEqual(10)
    })
  })

  describe('namespace statistics', () => {
    test('counts completed tasks from logs', () => {
      const logsDir = path.join(testRoot, '.loopwork/runs/default/run-1/logs')
      fs.mkdirSync(logsDir, { recursive: true })
      fs.writeFileSync(path.join(logsDir, 'task-1-completed.log'), 'done')
      fs.writeFileSync(path.join(logsDir, 'task-2-completed.log'), 'done')

      const dashboard = new Dashboard(testRoot, { MonitorClass })
      const stats = (dashboard as any).getNamespaceStats('default')

      expect(stats.tasks.completed).toBe(2)
    })

    test('counts failed tasks from logs', () => {
      const logsDir = path.join(testRoot, '.loopwork/runs/default/run-1/logs')
      fs.mkdirSync(logsDir, { recursive: true })
      fs.writeFileSync(path.join(logsDir, 'task-1-failed.log'), 'error')

      const dashboard = new Dashboard(testRoot, { MonitorClass })
      const stats = (dashboard as any).getNamespaceStats('default')

      expect(stats.tasks.failed).toBe(1)
    })

    test('identifies running status from monitor state', () => {
      const stateDir = path.join(testRoot, '.loopwork')
      fs.mkdirSync(stateDir, { recursive: true })
      const monitorState = path.join(stateDir, 'monitor-state.json')
      fs.writeFileSync(monitorState, JSON.stringify({
        processes: [{
          namespace: 'default',
          pid: process.pid,
          startedAt: new Date().toISOString(),
          logFile: 'test.log',
          args: [],
        }]
      }))

      const dashboard = new Dashboard(testRoot, { MonitorClass })
      const stats = (dashboard as any).getNamespaceStats('default')

      expect(stats.status).toBe('running')
      expect(stats.pid).toBe(process.pid)
    })

    test('marks as stopped when not in monitor state', () => {
      const dashboard = new Dashboard(testRoot, { MonitorClass })
      const stats = (dashboard as any).getNamespaceStats('default')

      expect(stats.status).toBe('stopped')
      expect(stats.pid).toBeUndefined()
    })
  })
})
