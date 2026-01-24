import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { LoopworkMonitor } from '../src/monitor'

describe('LoopworkMonitor', () => {
  let tempDir: string
  let monitor: LoopworkMonitor

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-monitor-test-'))
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
    fs.writeFileSync(stateFile, JSON.stringify({
      processes: [{
        namespace: 'dead-ns',
        pid: 999999999,
        startedAt: new Date().toISOString(),
        logFile: '/tmp/test.log',
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
        logFile: '/tmp/test.log',
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
        logFile: '/tmp/test.log',
        args: [],
      }]
    }))

    const result = await monitor.start('test-ns')
    expect(result.success).toBe(false)
    expect(result.error).toContain('already running')
  })
})
