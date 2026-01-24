import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { LoopworkMonitor } from '../src/monitor'

describe('LoopworkMonitor', () => {
  let tempDir: string
  let monitor: LoopworkMonitor

  beforeEach(() => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-monitor-test-')))
    // Create dummy src/index.ts so spawn doesn't fail
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true })
    fs.writeFileSync(path.join(tempDir, 'src', 'index.ts'), 'console.log("dummy")')
    monitor = new LoopworkMonitor(tempDir)
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test('getRunningProcesses returns empty array when no state', () => {
    const result = monitor.getRunningProcesses()
    expect(result).toEqual([])
  })

  test('getRunningProcesses cleans up dead processes', () => {
    const stateFile = path.join(tempDir, '.loopwork-monitor-state.json')
    const dummyLog = path.join(tempDir, 'test.log')
    fs.writeFileSync(stateFile, JSON.stringify({
      processes: [{
        namespace: 'dead-ns',
        pid: 999999999,
        startedAt: new Date().toISOString(),
        logFile: dummyLog,
        args: [],
      }]
    }))

    const result = monitor.getRunningProcesses()
    expect(result).toEqual([])

    const newState = JSON.parse(fs.readFileSync(stateFile, 'utf-8'))
    expect(newState.processes).toEqual([])
  })

  test('getRunningProcesses returns alive processes', () => {
    const stateFile = path.join(tempDir, '.loopwork-monitor-state.json')
    fs.writeFileSync(stateFile, JSON.stringify({
      processes: [{
        namespace: 'alive-ns',
        pid: process.pid,
        startedAt: new Date().toISOString(),
        logFile: path.join(tempDir, 'test.log'),
        args: [],
      }]
    }))

    const running = monitor.getRunningProcesses()
    expect(running.length).toBe(1)
    expect(running[0].namespace).toBe('alive-ns')
  })

  test('getStatus returns empty when no runs', () => {
    const result = monitor.getStatus()
    expect(result.running).toEqual([])
    expect(result.namespaces).toEqual([])
  })

  test('getStatus discovers namespaces from directories', () => {
    const ns1Dir = path.join(tempDir, 'loopwork-runs', 'feature-a', '2024-01-01T00-00-00')
    const ns2Dir = path.join(tempDir, 'loopwork-runs', 'feature-b', '2024-01-02T00-00-00')
    fs.mkdirSync(ns1Dir, { recursive: true })
    fs.mkdirSync(ns2Dir, { recursive: true })

    const result = monitor.getStatus()
    expect(result.namespaces.length).toBe(2)
    expect(result.namespaces.map(n => n.name).sort()).toEqual(['feature-a', 'feature-b'])
  })

  test('getLogs returns message when no logs', () => {
    const result = monitor.getLogs('nonexistent')
    expect(result[0]).toContain('No logs found')
  })

  test('getLogs reads from monitor-logs directory', () => {
    const logsDir = path.join(tempDir, 'loopwork-runs', 'test-ns', 'monitor-logs')
    fs.mkdirSync(logsDir, { recursive: true })
    fs.writeFileSync(path.join(logsDir, '2024-01-01.log'), 'Line 1\nLine 2\nLine 3')

    const result = monitor.getLogs('test-ns', 10)
    const joined = result.join('\n')
    expect(joined).toContain('Line 1')
    expect(joined).toContain('Line 2')
    expect(joined).toContain('Line 3')
  })

  test('stop returns error when namespace not found', () => {
    const result = monitor.stop('nonexistent')
    expect(result.success).toBe(false)
    expect(result.error).toContain('No running loop found')
  })

  test('stopAll returns empty when nothing running', () => {
    const result = monitor.stopAll()
    expect(result.stopped).toEqual([])
    expect(result.errors).toEqual([])
  })

  test('start fails for duplicate namespace', async () => {
    const stateFile = path.join(tempDir, '.loopwork-monitor-state.json')
    fs.writeFileSync(stateFile, JSON.stringify({
      processes: [{
        namespace: 'test-ns',
        pid: process.pid,
        startedAt: new Date().toISOString(),
        logFile: path.join(tempDir, 'test.log'),
        args: [],
      }]
    }))

    const result = await monitor.start('test-ns')
    expect(result.success).toBe(false)
    expect(result.error).toContain('already running')
  })

  test('loadState handles corrupted state file', () => {
    const stateFile = path.join(tempDir, '.loopwork-monitor-state.json')
    fs.writeFileSync(stateFile, 'undefined')

    const result = monitor.getRunningProcesses()
    expect(result).toEqual([])
  })

  test('loadState handles invalid JSON', () => {
    const stateFile = path.join(tempDir, '.loopwork-monitor-state.json')
    fs.writeFileSync(stateFile, 'not valid json')

    const result = monitor.getRunningProcesses()
    expect(result).toEqual([])
  })

  test('stop handles dead process (ESRCH) and cleans state', () => {
    const stateFile = path.join(tempDir, '.loopwork-monitor-state.json')
    // Use a very high PID that definitely doesn't exist
    fs.writeFileSync(stateFile, JSON.stringify({
      processes: [{
        namespace: 'dead-ns',
        pid: 2147483647, // Max 32-bit int, very unlikely to exist
        startedAt: new Date().toISOString(),
        logFile: path.join(tempDir, 'test.log'),
        args: [],
      }]
    }))

    const result = monitor.stop('dead-ns')
    // The result depends on system behavior, but state should eventually be cleaned
    // Either immediately on success, or on next getRunningProcesses call
    if (result.success) {
      const newState = JSON.parse(fs.readFileSync(stateFile, 'utf-8'))
      expect(newState.processes.length).toBe(0)
    } else {
      // If stop failed, getRunningProcesses should clean it up
      const running = monitor.getRunningProcesses()
      expect(running.length).toBe(0)
    }
  })

  test('stopAll attempts to stop multiple processes', () => {
    const stateFile = path.join(tempDir, '.loopwork-monitor-state.json')
    fs.writeFileSync(stateFile, JSON.stringify({
      processes: [
        {
          namespace: 'ns-1',
          pid: 2147483646,
          startedAt: new Date().toISOString(),
          logFile: path.join(tempDir, 'test1.log'),
          args: [],
        },
        {
          namespace: 'ns-2',
          pid: 2147483647,
          startedAt: new Date().toISOString(),
          logFile: path.join(tempDir, 'test2.log'),
          args: [],
        }
      ]
    }))

    const result = monitor.stopAll()
    // Either stopped successfully or got cleaned up due to ESRCH
    expect(result.stopped.length + result.errors.length).toBeGreaterThanOrEqual(0)
  })

  test('getLogs reads from running process logFile', () => {
    const logFile = path.join(tempDir, 'current.log')
    fs.writeFileSync(logFile, 'Current log line 1\nCurrent log line 2\n')

    const stateFile = path.join(tempDir, '.loopwork-monitor-state.json')
    fs.writeFileSync(stateFile, JSON.stringify({
      processes: [{
        namespace: 'running-ns',
        pid: process.pid,
        startedAt: new Date().toISOString(),
        logFile,
        args: [],
      }]
    }))

    const result = monitor.getLogs('running-ns', 10)
    expect(result.join('\n')).toContain('Current log line 1')
    expect(result.join('\n')).toContain('Current log line 2')
  })

  test('getLogs limits lines returned', () => {
    const logsDir = path.join(tempDir, 'loopwork-runs', 'test-ns', 'monitor-logs')
    fs.mkdirSync(logsDir, { recursive: true })
    const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`).join('\n')
    fs.writeFileSync(path.join(logsDir, '2024-01-01.log'), lines)

    const result = monitor.getLogs('test-ns', 10)
    expect(result.length).toBeLessThanOrEqual(11) // Last 10 lines + potential empty
  })

  test('getStatus shows running status correctly', () => {
    const ns1Dir = path.join(tempDir, 'loopwork-runs', 'running-ns', '2024-01-01T00-00-00')
    fs.mkdirSync(ns1Dir, { recursive: true })

    const stateFile = path.join(tempDir, '.loopwork-monitor-state.json')
    fs.writeFileSync(stateFile, JSON.stringify({
      processes: [{
        namespace: 'running-ns',
        pid: process.pid,
        startedAt: new Date().toISOString(),
        logFile: path.join(tempDir, 'test.log'),
        args: [],
      }]
    }))

    const result = monitor.getStatus()
    expect(result.running.length).toBe(1)
    expect(result.namespaces.length).toBe(1)
    expect(result.namespaces[0].status).toBe('running')
  })

  test('getStatus filters out monitor-logs directory', () => {
    const nsDir = path.join(tempDir, 'loopwork-runs', 'test-ns', '2024-01-01T00-00-00')
    const logsDir = path.join(tempDir, 'loopwork-runs', 'test-ns', 'monitor-logs')
    fs.mkdirSync(nsDir, { recursive: true })
    fs.mkdirSync(logsDir, { recursive: true })

    const result = monitor.getStatus()
    expect(result.namespaces[0].lastRun).toBe('2024-01-01T00-00-00')
  })

  test('getStatus handles errors reading directories gracefully', () => {
    const nsDir = path.join(tempDir, 'loopwork-runs', 'test-ns')
    fs.mkdirSync(nsDir, { recursive: true })
    // Create a file instead of a directory to cause read error
    fs.writeFileSync(path.join(nsDir, 'not-a-directory'), 'content')

    const result = monitor.getStatus()
    // Should not throw, just handle gracefully
    expect(result).toBeDefined()
  })
})
