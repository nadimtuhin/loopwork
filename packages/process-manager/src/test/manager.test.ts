import { describe, expect, test, mock } from 'bun:test'
import { ProcessManager } from '../manager'
import { ProcessRegistry } from '../registry'
import { OrphanDetector } from '../orphan-detector'
import { MemoryPersistence } from '../persistence/memory'
import type { ISpawner, ISpawnedProcess } from '@loopwork-ai/contracts/process'
import { EventEmitter } from 'events'

describe('ProcessManager Integration', () => {
  test('should spawn a process and track it in registry', async () => {
    const persistence = new MemoryPersistence()
    const registry = new ProcessRegistry(persistence)
    const detector = new OrphanDetector(registry, [], 60000)
    
    const mockProcess = new EventEmitter() as any
    Object.defineProperties(mockProcess, {
      pid: { value: 12345 },
      stdout: { value: null },
      stderr: { value: null },
      stdin: { value: null }
    })
    mockProcess.kill = mock(() => true)

    const mockSpawner: ISpawner = {
      name: 'mock',
      isAvailable: () => true,
      spawn: mock(() => mockProcess as ISpawnedProcess)
    }

    const manager = new ProcessManager(registry, mockSpawner, detector)

    const spawned = manager.spawn('echo', ['hello'])

    expect(spawned.pid).toBe(12345)
    expect(mockSpawner.spawn).toHaveBeenCalledWith('echo', ['hello'], undefined)
    
    await new Promise(resolve => setTimeout(resolve, 50))
    
    const tracked = manager.listChildren()
    expect(tracked).toHaveLength(1)
    expect(tracked[0].pid).toBe(12345)
    expect(tracked[0].command).toBe('echo')
  })

  test('should untrack process on exit', async () => {
    const persistence = new MemoryPersistence()
    const registry = new ProcessRegistry(persistence)
    const detector = new OrphanDetector(registry, [], 60000)
    
    const mockProcess = new EventEmitter() as any
    Object.defineProperties(mockProcess, {
      pid: { value: 54321 },
      stdout: { value: null },
      stderr: { value: null },
      stdin: { value: null }
    })
    mockProcess.kill = mock(() => true)

    const mockSpawner: ISpawner = {
      name: 'mock',
      isAvailable: () => true,
      spawn: mock(() => mockProcess as ISpawnedProcess)
    }

    const manager = new ProcessManager(registry, mockSpawner, detector)

    manager.spawn('sleep', ['10'])
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(manager.listChildren()).toHaveLength(1)

    mockProcess.emit('exit', 0, null)
    
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(manager.listChildren()).toHaveLength(0)
  })
})
