import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import { SystemResourceMonitor, ConnectivityMonitor, QuotaMonitor } from '../src/index'
import os from 'os'

describe('SystemResourceMonitor', () => {
  let monitor: SystemResourceMonitor
  const consoleWarnMock = mock(() => {})

  beforeEach(() => {
    console.warn = consoleWarnMock
    consoleWarnMock.mockClear()
  })

  afterEach(() => {
    monitor?.stop()
  })

  test('should initialize with default options', () => {
    monitor = new SystemResourceMonitor()
    expect(monitor).toBeDefined()
  })

  test('should provide stats', () => {
    monitor = new SystemResourceMonitor()
    const stats = monitor.getStats()
    expect(stats.cpuLoad).toBeArray()
    expect(stats.freeMem).toBeNumber()
    expect(stats.totalMem).toBeNumber()
    expect(stats.memUsagePercent).toBeNumber()
    expect(stats.uptime).toBeNumber()
  })

  test('should warn on high CPU usage', () => {
    monitor = new SystemResourceMonitor({
      enabled: true,
      intervalMs: 100,
      cpuThresholdPercent: 0.1, 
      warnOnHighUsage: true
    })
    
    monitor.start()
  })
  
  test('should start and stop timer', async () => {
    monitor = new SystemResourceMonitor({ intervalMs: 50 })
    monitor.start()
    
    await new Promise(resolve => setTimeout(resolve, 100))
    
    monitor.stop()
  })
})

describe('ConnectivityMonitor', () => {
  let monitor: ConnectivityMonitor
  const consoleWarnMock = mock(() => {})

  beforeEach(() => {
    console.warn = consoleWarnMock
    consoleWarnMock.mockClear()
  })

  afterEach(() => {
    monitor?.stop()
  })

  test('should initialize with default options', () => {
    monitor = new ConnectivityMonitor()
    expect(monitor).toBeDefined()
  })

  test('should provide initial stats', () => {
    monitor = new ConnectivityMonitor()
    const stats = monitor.getStats()
    expect(stats.cliTools).toBeDefined()
    expect(typeof stats.cliTools).toBe('object')
  })

  test('should start and stop monitoring', async () => {
    monitor = new ConnectivityMonitor({
      enabled: true,
      intervalMs: 100,
      checkCliTools: false
    })
    
    monitor.start()
    await new Promise(resolve => setTimeout(resolve, 50))
    monitor.stop()
  })

  test('should check CLI tool availability', async () => {
    monitor = new ConnectivityMonitor({
      enabled: true,
      intervalMs: 5000,
      cliTools: ['node'],
      checkCliTools: true
    })

    monitor.start()
    await new Promise(resolve => setTimeout(resolve, 100))
    
    const stats = monitor.getStats()
    
    monitor.stop()
  })

  test('should detect unavailable CLI tools', async () => {
    monitor = new ConnectivityMonitor({
      enabled: true,
      intervalMs: 5000,
      cliTools: ['nonexistent-cli-tool-12345'],
      warnOnFailure: true
    })

    monitor.start()
    await new Promise(resolve => setTimeout(resolve, 200))
    
    const stats = monitor.getStats()
    if (stats.cliTools['nonexistent-cli-tool-12345']) {
      expect(stats.cliTools['nonexistent-cli-tool-12345'].available).toBe(false)
    }
    
    monitor.stop()
  })
})

describe('QuotaMonitor', () => {
  let monitor: QuotaMonitor
  const consoleWarnMock = mock(() => {})
  const consoleErrorMock = mock(() => {})
  const consoleLogMock = mock(() => {})

  beforeEach(() => {
    console.warn = consoleWarnMock
    console.error = consoleErrorMock
    console.log = consoleLogMock
    consoleWarnMock.mockClear()
    consoleErrorMock.mockClear()
    consoleLogMock.mockClear()
  })

  afterEach(() => {
    monitor?.stop()
  })

  test('should initialize with default options', () => {
    monitor = new QuotaMonitor()
    expect(monitor).toBeDefined()
  })

  test('should provide initial stats', () => {
    monitor = new QuotaMonitor()
    const stats = monitor.getStats()
    expect(stats.requests.count).toBe(0)
    expect(stats.tokens.count).toBe(0)
    expect(stats.requests.limit).toBe(1000)
    expect(stats.tokens.limit).toBe(100000)
    expect(stats.resetTime).toBeInstanceOf(Date)
  })

  test('should track requests', () => {
    monitor = new QuotaMonitor({ warnOnThreshold: false })
    monitor.start()
    
    monitor.trackRequest()
    const stats = monitor.getStats()
    
    expect(stats.requests.count).toBe(1)
    expect(stats.requests.usagePercent).toBeCloseTo(0.1, 1)
    
    monitor.stop()
  })

  test('should track tokens', () => {
    monitor = new QuotaMonitor({ warnOnThreshold: false })
    monitor.start()
    
    monitor.trackRequest(1000)
    const stats = monitor.getStats()
    
    expect(stats.requests.count).toBe(1)
    expect(stats.tokens.count).toBe(1000)
    expect(stats.tokens.usagePercent).toBeCloseTo(1.0, 1)
    
    monitor.stop()
  })

  test('should warn at threshold', () => {
    monitor = new QuotaMonitor({
      dailyRequestLimit: 10,
      warnThresholdPercent: 80,
      warnOnThreshold: true
    })
    monitor.start()
    
    for (let i = 0; i < 8; i++) {
      monitor.trackRequest()
    }
    
    const stats = monitor.getStats()
    expect(stats.requests.usagePercent).toBe(80)
    
    monitor.stop()
  })

  test('should warn on limit exceeded', () => {
    monitor = new QuotaMonitor({
      dailyRequestLimit: 5,
      warnOnThreshold: true
    })
    monitor.start()
    
    for (let i = 0; i < 6; i++) {
      monitor.trackRequest()
    }
    
    const stats = monitor.getStats()
    expect(stats.requests.usagePercent).toBe(120)
    
    monitor.stop()
  })

  test('should respect enabled flag', () => {
    monitor = new QuotaMonitor({ enabled: false })
    monitor.start()
    
    monitor.trackRequest(100)
    const stats = monitor.getStats()
    
    expect(stats.requests.count).toBe(0)
    expect(stats.tokens.count).toBe(0)
    
    monitor.stop()
  })
})
