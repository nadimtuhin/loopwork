import { describe, test, expect } from 'bun:test'
import { NetworkMonitor, createNetworkMonitorPlugin, withNetworkMonitor } from '../src'

describe('NetworkMonitor', () => {
  test('creates monitor with default config', () => {
    const monitor = new NetworkMonitor()
    expect(monitor).toBeDefined()
    expect(monitor.isOnline()).toBe(true)
  })

  test('gets initial status', () => {
    const monitor = new NetworkMonitor()
    const status = monitor.getStatus()
    
    expect(status).toBeDefined()
    expect(status.online).toBeDefined()
    expect(status.quality).toBeDefined()
    expect(status.recommendedWorkers).toBeGreaterThanOrEqual(0)
  })

  test('calculates recommended workers', () => {
    const monitor = new NetworkMonitor()
    const recommended = monitor.getRecommendedWorkers(5)
    
    expect(recommended).toBeGreaterThanOrEqual(0)
    expect(recommended).toBeLessThanOrEqual(5)
  })

  test('supports onChange listeners', () => {
    const monitor = new NetworkMonitor()
    let called = false
    
    const listener = () => {
      called = true
    }
    
    monitor.onChange(listener)
    monitor.offChange(listener)
    
    expect(called).toBe(false)
  })
})

describe('Plugin', () => {
  test('creates plugin', () => {
    const plugin = createNetworkMonitorPlugin({
      enabled: true,
    })
    
    expect(plugin.name).toBe('network-monitor')
    expect(plugin.classification).toBe('critical')
    expect(plugin.requiresNetwork).toBe(false)
  })

  test('withNetworkMonitor wrapper', () => {
    const wrapper = withNetworkMonitor({
      enabled: true,
      adjustWorkerPool: true,
    })
    
    const config = wrapper({
      parallel: 5,
      plugins: [],
    })
    
    expect(config).toBeDefined()
    expect((config as any).plugins).toBeDefined()
    expect((config as any).plugins.length).toBeGreaterThan(0)
  })
})
