import { describe, expect, it, beforeEach, spyOn } from 'bun:test'
import { OrphanDetector } from '../orphan-detector'
import { ProcessRegistry } from '../registry'
import { MemoryPersistence } from '../persistence/memory'

describe('OrphanDetector', () => {
  let detector: OrphanDetector
  let registry: ProcessRegistry
  const patterns = ['test-proc']
  const staleTimeoutMs = 1000

  beforeEach(() => {
    registry = new ProcessRegistry(new MemoryPersistence())
    detector = new OrphanDetector(registry, patterns, staleTimeoutMs)
  })

  it('should detect stale processes', async () => {
    const now = Date.now()
    await registry.add(103, {
      command: 'test-proc',
      args: [],
      namespace: 'default',
      startTime: now - (staleTimeoutMs + 100),
      parentPid: process.pid
    } as any)

    const orphans = await detector.scan()
    const stale = orphans.find(o => o.pid === 103 && o.reason === 'stale')
    expect(stale).toBeDefined()
  })

  it('should detect untracked processes', async () => {
    const mockProc = {
      pid: 201,
      command: 'test-proc',
      args: [],
      namespace: 'unknown',
      startTime: Date.now(),
      status: 'running' as const
    }
    
    spyOn(detector as any, 'scanRunningProcesses').mockReturnValue([mockProc])
    
    const orphans = await detector.scan()
    const untracked = orphans.find(o => o.pid === 201 && o.reason === 'untracked')
    expect(untracked).toBeDefined()
  })

  it('should deduplicate orphans', async () => {
    const now = Date.now()
    await registry.add(104, {
      command: 'test-proc',
      args: [],
      namespace: 'default',
      startTime: now - (staleTimeoutMs + 100),
      parentPid: 1
    } as any)

    const orphans = await detector.scan()
    const matches = orphans.filter(o => o.pid === 104)
    expect(matches).toHaveLength(1)
  })
})
