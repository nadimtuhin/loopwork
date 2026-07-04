import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import fs from 'fs'
import path from 'path'
import { FileHeartbeatProvider } from '../src/heartbeat'

describe('FileHeartbeatProvider', () => {
  const testDir = path.join(import.meta.dir, 'tmp-heartbeat')
  const heartbeatFile = path.join(testDir, 'heartbeat.json')

  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true })
    }
  })

  afterEach(() => {
    if (fs.existsSync(heartbeatFile)) {
      fs.unlinkSync(heartbeatFile)
    }
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
  })

  test('should create heartbeat file on beat', async () => {
    const provider = new FileHeartbeatProvider('test-id', 'Test Provider', heartbeatFile)
    await provider.beat()

    expect(fs.existsSync(heartbeatFile)).toBe(true)
    const data = JSON.parse(fs.readFileSync(heartbeatFile, 'utf-8'))
    expect(data.source).toBe('test-id')
    expect(data.pid).toBe(process.pid)
    expect(data.sequence).toBe(1)
  })

  test('should increment sequence on multiple beats', async () => {
    const provider = new FileHeartbeatProvider('test-id', 'Test Provider', heartbeatFile)
    await provider.beat()
    await provider.beat()

    const data = JSON.parse(fs.readFileSync(heartbeatFile, 'utf-8'))
    expect(data.sequence).toBe(2)
  })

  test('should start and stop periodic heartbeats', async () => {
    const provider = new FileHeartbeatProvider('test-id', 'Test Provider', heartbeatFile, {
      interval: 50,
    })

    await provider.start()
    expect(provider.isActive).toBe(true)
    expect(provider.totalBeats).toBe(1)

    await new Promise((r) => setTimeout(r, 70))
    expect(provider.totalBeats).toBeGreaterThan(1)

    await provider.stop()
    expect(provider.isActive).toBe(false)
    
    const countAfterStop = provider.totalBeats
    await new Promise((r) => setTimeout(r, 70))
    expect(provider.totalBeats).toBe(countAfterStop)
  })

  describe('isStale', () => {
    test('should return true if file does not exist', () => {
      expect(FileHeartbeatProvider.isStale(heartbeatFile, 1000)).toBe(true)
    })

    test('should return false if file is fresh and process is alive', async () => {
      const provider = new FileHeartbeatProvider('test-id', 'Test Provider', heartbeatFile)
      await provider.beat()
      
      expect(FileHeartbeatProvider.isStale(heartbeatFile, 1000)).toBe(false)
    })

    test('should return true if file is older than timeout', async () => {
      const provider = new FileHeartbeatProvider('test-id', 'Test Provider', heartbeatFile)
      await provider.beat()
      
      const past = new Date(Date.now() - 2000)
      fs.utimesSync(heartbeatFile, past, past)
      
      expect(FileHeartbeatProvider.isStale(heartbeatFile, 1000)).toBe(true)
    })

    test('should return true if process is not alive', async () => {
      const provider = new FileHeartbeatProvider('test-id', 'Test Provider', heartbeatFile)
      await provider.beat()
      
      const data = JSON.parse(fs.readFileSync(heartbeatFile, 'utf-8'))
      data.pid = 9999999
      fs.writeFileSync(heartbeatFile, JSON.stringify(data), 'utf-8')
      
      expect(FileHeartbeatProvider.isStale(heartbeatFile, 10000)).toBe(true)
    })
  })
})
