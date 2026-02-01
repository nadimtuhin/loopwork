import { describe, expect, test } from 'bun:test'
import { MockProcessManager } from '../mock-process-manager'

describe('MockProcessManager', () => {
  test('should track method calls', () => {
    const manager = new MockProcessManager()
    manager.spawn('node', ['test.js'])
    
    expect(manager.spawnCalls).toHaveLength(1)
    expect(manager.spawnCalls[0].command).toBe('node')
    expect(manager.listChildren()).toHaveLength(1)
  })

  test('should kill tracked process', () => {
    const manager = new MockProcessManager()
    const proc = manager.spawn('node', ['test.js'])
    
    expect(manager.listChildren()).toHaveLength(1)
    manager.kill(proc.pid!)
    expect(manager.listChildren()).toHaveLength(0)
    expect(manager.killCalls).toHaveLength(1)
  })
})
