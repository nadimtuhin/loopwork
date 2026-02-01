import { describe, expect, test, beforeEach, mock } from 'bun:test'
import { OrphanDetector } from '../orphan-detector'
import { ProcessRegistry } from '../registry'

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
    registry = new ProcessRegistry('.test')
    detector = new OrphanDetector(registry, patterns, staleTimeoutMs)
  })

  test('should detect dead parent orphans', async () => {
    registry.add(101, {
      command: 'claude',
      args: [],
      namespace: 'default',
      startTime: Date.now(),
      parentPid: 111
    } as any)

    registry.add(102, {
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
    registry.add(103, {
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
    registry.add(104, {
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
    registry.add(105, {
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
