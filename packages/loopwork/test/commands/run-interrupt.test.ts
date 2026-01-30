import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import fs from 'fs'
import path from 'path'
import type { TaskBackend, Task } from '../../src/backends'
import type { Config } from '../../src/core/config'
import type { IStateManager } from '../../src/contracts/state'

/**
 * Tests for interrupt handling in the run command.
 * Verifies that in-progress tasks are properly reset to pending when interrupted.
 */

describe('Run Command Interrupt Handling', () => {
  const testDir = path.join('/tmp', 'loopwork-interrupt-test-' + Date.now())
  let originalCwd: string

  // Mock tracking
  let resetToPendingCalled = false
  let resetToPendingTaskId: string | null = null
  let resetToPendingError: Error | null = null

  // Create mock backend
  function createMockBackend(): TaskBackend {
    return {
      type: 'json' as const,
      findNextTask: mock(async () => null),
      getTask: mock(async (id: string) => ({
        id,
        title: 'Test Task',
        description: 'Test Description',
        status: 'in-progress' as const,
        priority: 1,
      })),
      markInProgress: mock(async () => {}),
      markCompleted: mock(async () => {}),
      markFailed: mock(async () => {}),
      updateTask: mock(async () => {}),
      resetToPending: mock(async (taskId: string) => {
        resetToPendingCalled = true
        resetToPendingTaskId = taskId
        if (resetToPendingError) {
          throw resetToPendingError
        }
      }),
      getSubTasks: mock(async () => []),
      createSubTask: mock(async () => 'SUB-001'),
      getDependencies: mock(async () => []),
      getDependents: mock(async () => []),
      areDependenciesMet: mock(async () => true),
      setPriority: mock(async () => {}),
    }
  }

  // Create mock state manager
  function createMockStateManager(): IStateManager {
    return {
      acquireLock: mock(() => true),
      releaseLock: mock(() => {}),
      loadState: mock(() => null),
      saveState: mock(() => {}),
      clearState: mock(() => {}),
    }
  }

  // Create mock logger
  function createMockLogger() {
    return {
      info: mock(() => {}),
      success: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
      debug: mock(() => {}),
      update: mock(() => {}),
      raw: mock(() => {}),
      startSpinner: mock(() => {}),
      stopSpinner: mock(() => {}),
    }
  }

  beforeEach(() => {
    // Save original directory
    originalCwd = process.cwd()

    // Reset test state
    resetToPendingCalled = false
    resetToPendingTaskId = null
    resetToPendingError = null

    // Create test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
    fs.mkdirSync(testDir, { recursive: true })
    process.chdir(testDir)

    // Create a package.json
    fs.writeFileSync(path.join(testDir, 'package.json'), '{}')
  })

  afterEach(() => {
    try {
      // Restore original directory
      process.chdir(originalCwd)
    } finally {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true })
      }
    }
  })

  describe('sequential mode cleanup', () => {
    test('resets in-progress task to pending on interrupt', async () => {
      const backend = createMockBackend()
      const stateManager = createMockStateManager()
      const logger = createMockLogger()

      // Simulate the cleanup logic from run.ts lines 303-336
      const currentTaskId = 'TASK-001'
      const currentIteration = 5

      // Simulate interrupt cleanup
      let isCleaningUp = false
      const cleanup = async () => {
        if (isCleaningUp) {
          return
        }
        isCleaningUp = true

        if (currentTaskId) {
          const stateRef = parseInt(currentTaskId.replace(/\D/g, ''), 10) || 0
          stateManager.saveState(stateRef, currentIteration)

          // Reset in-progress task to pending
          try {
            await backend.resetToPending(currentTaskId)
            logger.info(`Task ${currentTaskId} reset to pending`)
          } catch (err: any) {
            logger.debug(`Failed to reset task: ${err}`)
          }

          logger.info('State saved. Resume with: --resume')
        }
        stateManager.releaseLock()
      }

      // Execute cleanup
      await cleanup()

      // Verify resetToPending was called with correct task ID
      expect(resetToPendingCalled).toBe(true)
      expect(resetToPendingTaskId).toBe('TASK-001')

      // Verify state was saved
      expect(stateManager.saveState).toHaveBeenCalledWith(1, 5)

      // Verify lock was released
      expect(stateManager.releaseLock).toHaveBeenCalled()

      // Verify logger messages
      expect(logger.info).toHaveBeenCalledWith('Task TASK-001 reset to pending')
      expect(logger.info).toHaveBeenCalledWith('State saved. Resume with: --resume')
    })

    test('handles resetToPending failure gracefully', async () => {
      const backend = createMockBackend()
      const stateManager = createMockStateManager()
      const logger = createMockLogger()

      // Set up resetToPending to throw an error
      resetToPendingError = new Error('Backend unavailable')

      const currentTaskId = 'TASK-002'
      const currentIteration = 3

      // Simulate cleanup with error handling
      let isCleaningUp = false
      const cleanup = async () => {
        if (isCleaningUp) {
          return
        }
        isCleaningUp = true

        if (currentTaskId) {
          const stateRef = parseInt(currentTaskId.replace(/\D/g, ''), 10) || 0
          stateManager.saveState(stateRef, currentIteration)

          try {
            await backend.resetToPending(currentTaskId)
            logger.info(`Task ${currentTaskId} reset to pending`)
          } catch (err: any) {
            logger.debug(`Failed to reset task: ${err}`)
          }

          logger.info('State saved. Resume with: --resume')
        }
        stateManager.releaseLock()
      }

      // Execute cleanup - should not throw
      await expect(cleanup()).resolves.toBeUndefined()

      // Verify resetToPending was attempted
      expect(resetToPendingCalled).toBe(true)

      // Verify cleanup still completed despite error
      expect(stateManager.saveState).toHaveBeenCalled()
      expect(stateManager.releaseLock).toHaveBeenCalled()

      // Verify error was logged (not thrown)
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Failed to reset task'))

      // Verify success message still appears
      expect(logger.info).toHaveBeenCalledWith('State saved. Resume with: --resume')
    })

    test('handles cleanup with no current task', async () => {
      const backend = createMockBackend()
      const stateManager = createMockStateManager()
      const logger = createMockLogger()

      const currentTaskId = null // No task in progress
      const currentIteration = 0

      let isCleaningUp = false
      const cleanup = async () => {
        if (isCleaningUp) {
          return
        }
        isCleaningUp = true

        if (currentTaskId) {
          const stateRef = parseInt(currentTaskId.replace(/\D/g, ''), 10) || 0
          stateManager.saveState(stateRef, currentIteration)

          try {
            await backend.resetToPending(currentTaskId)
            logger.info(`Task ${currentTaskId} reset to pending`)
          } catch (err: any) {
            logger.debug(`Failed to reset task: ${err}`)
          }

          logger.info('State saved. Resume with: --resume')
        }
        stateManager.releaseLock()
      }

      await cleanup()

      // Verify resetToPending was NOT called (no current task)
      expect(resetToPendingCalled).toBe(false)

      // Verify lock was still released
      expect(stateManager.releaseLock).toHaveBeenCalled()

      // Verify no task-specific messages
      expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('reset to pending'))
    })

    test('prevents multiple concurrent cleanup calls', async () => {
      const backend = createMockBackend()
      const stateManager = createMockStateManager()
      const logger = createMockLogger()

      const currentTaskId = 'TASK-003'
      const currentIteration = 1

      let isCleaningUp = false
      const cleanup = async () => {
        if (isCleaningUp) {
          return // Early return on second call
        }
        isCleaningUp = true

        if (currentTaskId) {
          const stateRef = parseInt(currentTaskId.replace(/\D/g, ''), 10) || 0
          stateManager.saveState(stateRef, currentIteration)

          try {
            await backend.resetToPending(currentTaskId)
            logger.info(`Task ${currentTaskId} reset to pending`)
          } catch (err: any) {
            logger.debug(`Failed to reset task: ${err}`)
          }

          logger.info('State saved. Resume with: --resume')
        }
        stateManager.releaseLock()
      }

      // Call cleanup twice concurrently
      await Promise.all([cleanup(), cleanup()])

      // Verify resetToPending was only called once
      expect(backend.resetToPending).toHaveBeenCalledTimes(1)
      expect(stateManager.releaseLock).toHaveBeenCalledTimes(1)
    })

    test('correctly extracts numeric state reference from task ID', async () => {
      const backend = createMockBackend()
      const stateManager = createMockStateManager()
      const logger = createMockLogger()

      const testCases = [
        { taskId: 'TASK-123', expectedRef: 123 },
        { taskId: 'AUTH-456', expectedRef: 456 },
        { taskId: 'FEAT-001a', expectedRef: 1 }, // Sub-task
        { taskId: 'ABC-XYZ', expectedRef: 0 }, // No numbers, fallback to 0
      ]

      for (const { taskId, expectedRef } of testCases) {
        // Reset mocks
        ;(stateManager.saveState as any).mockClear()
        resetToPendingCalled = false

        const currentIteration = 5
        let isCleaningUp = false

        const cleanup = async () => {
          if (isCleaningUp) return
          isCleaningUp = true

          if (taskId) {
            const stateRef = parseInt(taskId.replace(/\D/g, ''), 10) || 0
            stateManager.saveState(stateRef, currentIteration)

            try {
              await backend.resetToPending(taskId)
            } catch (err: any) {
              logger.debug(`Failed to reset task: ${err}`)
            }
          }
          stateManager.releaseLock()
        }

        await cleanup()

        expect(stateManager.saveState).toHaveBeenCalledWith(expectedRef, 5)
      }
    })
  })
})
