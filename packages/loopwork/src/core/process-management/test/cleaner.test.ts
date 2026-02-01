import { describe, expect, test, beforeEach, spyOn, mock } from 'bun:test'
import { ProcessCleaner } from '../cleaner'
import { ProcessRegistry } from '../registry'

mock.module('../../../commands/shared/process-utils', () => ({
  isProcessAlive: (pid: number) => {
    return true
  }
}))

describe('ProcessCleaner', () => {
  let cleaner: ProcessCleaner
  let registry: ProcessRegistry

  beforeEach(() => {
    registry = new ProcessRegistry('.test')
    cleaner = new ProcessCleaner(registry)
  })

  test('should terminate process gracefully with SIGTERM', async () => {
    const pid = 1234
    registry.add(pid, { command: 'test', args: [], namespace: 'default', startTime: Date.now() })

    const processUtils = await import('../../../commands/shared/process-utils')
    const aliveSpy = spyOn(processUtils, 'isProcessAlive')
    const killSpy = spyOn(process, 'kill').mockImplementation(() => true as any)

    let callCount = 0
    aliveSpy.mockImplementation(() => {
      callCount++
      return callCount === 1
    })

    // @ts-ignore
    global.setTimeout = (fn) => { fn(); return {} as any }

    const result = await cleaner.gracefulKill(pid)
    expect(result).toBe(true)
    expect(killSpy).toHaveBeenCalledWith(pid, 'SIGTERM')
  })

  test('should force kill if SIGTERM fails', async () => {
    const pid = 5678
    registry.add(pid, { command: 'test', args: [], namespace: 'default', startTime: Date.now() })

    const processUtils = await import('../../../commands/shared/process-utils')
    const aliveSpy = spyOn(processUtils, 'isProcessAlive').mockReturnValue(true)
    const killSpy = spyOn(process, 'kill').mockImplementation(() => true as any)

    let callCount = 0
    aliveSpy.mockImplementation(() => {
      callCount++
      if (callCount <= 2) return true 
      return false
    })

    // @ts-ignore
    global.setTimeout = (fn) => { fn(); return {} as any }

    const result = await cleaner.gracefulKill(pid)
    expect(result).toBe(true)
    expect(killSpy).toHaveBeenCalledWith(pid, 'SIGTERM')
    expect(killSpy).toHaveBeenCalledWith(pid, 'SIGKILL')
  })

  test('should cleanup multiple orphans', async () => {
    const pid1 = 101
    const pid2 = 102
    registry.add(pid1, { command: 'test', args: [], namespace: 'default', startTime: Date.now() })
    registry.add(pid2, { command: 'test', args: [], namespace: 'default', startTime: Date.now() })

    const orphans = [
      { pid: pid1, reason: 'stale', process: registry.get(pid1)! },
      { pid: pid2, reason: 'parent-dead', process: registry.get(pid2)! }
    ] as any

    spyOn(cleaner, 'gracefulKill').mockResolvedValue(true)

    const result = await cleaner.cleanup(orphans)
    expect(result.cleaned).toHaveLength(2)
    expect(registry.get(pid1)).toBeUndefined()
    expect(registry.get(pid2)).toBeUndefined()
  })

  test('should handle permission errors', async () => {
    const pid = 1111
    registry.add(pid, { command: 'test', args: [], namespace: 'default', startTime: Date.now() })

    const processUtils = await import('../../../commands/shared/process-utils')
    spyOn(processUtils, 'isProcessAlive').mockReturnValue(true)
    spyOn(process, 'kill').mockImplementation(() => {
      throw { code: 'EPERM' }
    })

    await expect(cleaner.gracefulKill(pid)).rejects.toThrow(/Permission denied/)
  })
})
