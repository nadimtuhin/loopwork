import { describe, expect, test, beforeEach, mock } from 'bun:test'
import { OrphanDetector, ProcessRegistry, MemoryPersistence } from '@loopwork-ai/process-manager'

mock.module('../../../commands/shared/process-utils', () => ({
  isProcessAlive: (pid: number) => {
    if (pid === 111) return false
    if (pid === 222) return true
    return true
  }
}))

mock.module('child_process', () => ({
  execSync: () => '' 
}))

describe('OrphanDetector', () => {
  let detector: OrphanDetector
  let registry: ProcessRegistry
  const patterns = ['claude', 'opencode']
  const staleTimeoutMs = 1000

  beforeEach(() => {
    registry = new ProcessRegistry(new MemoryPersistence())
    detector = new OrphanDetector(registry, patterns, staleTimeoutMs)
    
    spyOn(process, 'kill').mockImplementation((pid, signal) => {
      if (signal === 0) {
        if (pid === 111) throw new Error('ESRCH')
        return true as any
      }
      return true as any
    })
  })

  test('should detect dead parent orphans', async () => {
    await registry.add(101, {
      command: 'claude',
      args: [],
      namespace: 'default',
      startTime: Date.now(),
      parentPid: 111
    } as any)

    await registry.add(102, {
      command: 'opencode',
      args: [],
      namespace: 'default',
      startTime: Date.now(),
      parentPid: 222
    } as any)

    const orphans = await detector['detectDeadParents']()
    expect(orphans).toHaveLength(1)
    expect(orphans[0].pid).toBe(101)
    expect(orphans[0].reason).toBe('parent-dead')
  })

  test('should detect stale processes', async () => {
    const now = Date.now()
    await registry.add(103, {
      command: 'claude',
      args: [],
      namespace: 'default',
      startTime: now - (staleTimeoutMs * 3),
      parentPid: 222
    } as any)

    const orphans = await detector['detectStaleProcesses']()
    expect(orphans).toHaveLength(1)
    expect(orphans[0].pid).toBe(103)
    expect(orphans[0].reason).toBe('stale')
  })

  test('should deduplicate orphans in scan()', async () => {
    const now = Date.now()
    await registry.add(104, {
      command: 'claude',
      args: [],
      namespace: 'default',
      startTime: now - (staleTimeoutMs * 3),
      parentPid: 111
    } as any)

    const orphans = await detector.scan()
    expect(orphans).toHaveLength(1)
    expect(orphans[0].pid).toBe(104)
  })

  test('should return empty if no orphans found', async () => {
    await registry.add(105, {
      command: 'claude',
      args: [],
      namespace: 'default',
      startTime: Date.now(),
      parentPid: 222
    } as any)

    const orphans = await detector.scan()
    expect(orphans).toHaveLength(0)
  })
})
