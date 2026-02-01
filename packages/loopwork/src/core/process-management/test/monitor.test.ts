import { describe, expect, test, beforeEach, spyOn } from 'bun:test'
import { ProcessResourceMonitor, createProcessResourceMonitor } from '../monitor'
import { ProcessRegistry } from '../registry'

describe('ProcessResourceMonitor', () => {
  let monitor: ProcessResourceMonitor
  let registry: ProcessRegistry
  let spawner: any

  beforeEach(() => {
    registry = new ProcessRegistry('.test-monitor')
    spyOn(registry, 'persist').mockResolvedValue(undefined)
    
    spawner = {
      spawn: () => ({ pid: 1234, on: () => {} })
    }
    
    monitor = createProcessResourceMonitor(registry, spawner, {
      enabled: true,
      cpuLimit: 50,
      memoryLimitMB: 512,
      checkIntervalMs: 1000,
      gracePeriodMs: 500
    })
  })

  test('should instantiate without errors', () => {
    expect(monitor).toBeDefined()
    expect(monitor).toBeInstanceOf(ProcessResourceMonitor)
  })

  test('should have correct initial state', () => {
    expect(monitor.isEnabled()).toBe(true)
    expect(monitor.isRunning()).toBe(false)
  })

  test('should start monitoring', () => {
    monitor.start()
    expect(monitor.isRunning()).toBe(true)
    monitor.stop()
  })

  test('should stop monitoring', () => {
    monitor.start()
    expect(monitor.isRunning()).toBe(true)
    monitor.stop()
    expect(monitor.isRunning()).toBe(false)
  })

  test('should return correct resource limits', () => {
    const limits = monitor.getResourceLimits()
    expect(limits.enabled).toBe(true)
    expect(limits.cpuLimit).toBe(50)
    expect(limits.memoryLimitMB).toBe(512)
    expect(limits.checkIntervalMs).toBe(1000)
    expect(limits.gracePeriodMs).toBe(500)
  })

  test('should update resource limits', () => {
    monitor.setResourceLimits({
      cpuLimit: 75,
      memoryLimitMB: 1024
    })
    
    const limits = monitor.getResourceLimits()
    expect(limits.cpuLimit).toBe(75)
    expect(limits.memoryLimitMB).toBe(1024)
  })

  test('should return stats', () => {
    const stats = monitor.getStats()
    expect(stats.enabled).toBe(true)
    expect(stats.running).toBe(false)
    expect(stats.checkCount).toBe(0)
    expect(stats.limits).toBeDefined()
  })

  test('should not start when disabled', () => {
    const disabledMonitor = createProcessResourceMonitor(registry, spawner, {
      enabled: false
    })
    
    disabledMonitor.start()
    expect(disabledMonitor.isRunning()).toBe(false)
  })

  test('should handle check with no processes', async () => {
    await monitor.check()
    const stats = monitor.getStats()
    expect(stats.checkCount).toBe(1)
  })
})

describe('createProcessResourceMonitor', () => {
  test('should create monitor with default limits', () => {
    const registry = new ProcessRegistry('.test-default')
    const spawner = { 
      name: 'test-spawner',
      isAvailable: () => true,
      spawn: () => ({}) 
    }
    
    const monitor = createProcessResourceMonitor(registry, spawner as any)
    
    const limits = monitor.getResourceLimits()
    expect(limits.enabled).toBe(true)
    expect(limits.cpuLimit).toBe(100)
    expect(limits.memoryLimitMB).toBe(2048)
    expect(limits.checkIntervalMs).toBe(10000)
    expect(limits.gracePeriodMs).toBe(5000)
  })

  test('should create monitor with custom limits', () => {
    const registry = new ProcessRegistry('.test-custom')
    const spawner = { 
      name: 'test-spawner',
      isAvailable: () => true,
      spawn: () => ({}) 
    }
    
    const monitor = createProcessResourceMonitor(registry, spawner as any, {
      enabled: true,
      cpuLimit: 25,
      memoryLimitMB: 256,
      checkIntervalMs: 5000,
      gracePeriodMs: 2000
    })
    
    const limits = monitor.getResourceLimits()
    expect(limits.cpuLimit).toBe(25)
    expect(limits.memoryLimitMB).toBe(256)
    expect(limits.checkIntervalMs).toBe(5000)
    expect(limits.gracePeriodMs).toBe(2000)
  })
})
