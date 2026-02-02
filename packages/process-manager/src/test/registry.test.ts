import { describe, expect, it, beforeEach } from 'bun:test'
import { ProcessRegistry } from '../registry'
import { MemoryPersistence } from '../persistence/memory'

describe('ProcessRegistry', () => {
  let registry: ProcessRegistry
  let persistence: MemoryPersistence

  beforeEach(() => {
    persistence = new MemoryPersistence()
    registry = new ProcessRegistry(persistence)
  })

  it('should add and list processes', async () => {
    const metadata = {
      command: 'test',
      args: [],
      namespace: 'default',
      startTime: Date.now()
    }

    await registry.add(123, metadata)
    const list = registry.list()

    expect(list).toHaveLength(1)
    expect(list[0].pid).toBe(123)
    expect(list[0].command).toBe('test')
  })

  it('should remove processes', async () => {
    await registry.add(123, {
      command: 'test',
      args: [],
      namespace: 'default',
      startTime: Date.now()
    })
    
    await registry.remove(123)
    expect(registry.list()).toHaveLength(0)
  })

  it('should update status', async () => {
    await registry.add(123, {
      command: 'test',
      args: [],
      namespace: 'default',
      startTime: Date.now()
    })

    await registry.updateStatus(123, 'stopped')
    expect(registry.get(123)?.status).toBe('stopped')
  })

  it('should persist and load', async () => {
    await registry.add(123, {
      command: 'test',
      args: [],
      namespace: 'default',
      startTime: Date.now()
    })

    const newRegistry = new ProcessRegistry(persistence)
    await newRegistry.load()
    
    expect(newRegistry.list()).toHaveLength(1)
    expect(newRegistry.get(123)?.pid).toBe(123)
  })
})
