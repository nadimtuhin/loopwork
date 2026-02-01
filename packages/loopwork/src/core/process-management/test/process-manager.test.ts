import { describe, expect, test, beforeEach, spyOn, mock } from 'bun:test'
import { ProcessManager } from '../process-manager'
import { ProcessRegistry } from '../registry'
import { OrphanDetector } from '../orphan-detector'
import { ProcessCleaner } from '../cleaner'

describe('ProcessManager', () => {
  let manager: ProcessManager
  let registry: ProcessRegistry
  let detector: OrphanDetector
  let cleaner: ProcessCleaner
  let spawner: any

  beforeEach(() => {
    registry = new ProcessRegistry('.test-pm')
    spyOn(registry, 'persist').mockResolvedValue(undefined)
    
    detector = new OrphanDetector(registry, [], 1000)
    cleaner = new ProcessCleaner(registry)
    spawner = {
      spawn: () => ({ pid: 1234, on: () => {} })
    }
    manager = new ProcessManager(registry, detector, cleaner, spawner)
  })

  test('should instantiate without errors', () => {
    expect(manager).toBeDefined()
    expect(manager).toBeInstanceOf(ProcessManager)
  })

  test('should track spawned processes', () => {
    const trackSpy = spyOn(manager, 'track')
    manager.spawn('node', ['script.js'])
    expect(trackSpy).toHaveBeenCalled()
  })

  test('should cleanup orphans', async () => {
    const scanSpy = spyOn(detector, 'scan').mockResolvedValue([])
    const cleanupSpy = spyOn(cleaner, 'cleanup').mockResolvedValue({ cleaned: [], failed: [], alreadyGone: [] })
    
    await manager.cleanup()
    
    expect(scanSpy).toHaveBeenCalled()
    expect(cleanupSpy).toHaveBeenCalled()
  })
})
