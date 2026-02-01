import { describe, expect, test, mock, beforeEach } from 'bun:test'
import { createRollbackPlugin } from '../rollback'
import type { TaskContext } from '../../contracts'
import type { RollbackSelection } from '../rollback-prompt'

// Mock dependencies
const mockSnapshots = {
  takeSnapshot: mock(() => Promise.resolve({ id: 'snap1', hash: 'hash1', taskId: 'TASK-1' })),
  rollbackToSnapshot: mock(() => Promise.resolve(true)),
  getChangesSinceSnapshot: mock(() => ['file1.ts']),
  rollbackFiles: mock(() => Promise.resolve(true))
}

mock.module('../../utils/git-snapshots', () => mockSnapshots)

const mockPrompt = {
  promptForRollback: mock(() => Promise.resolve({ action: 'selective', files: ['file1.ts'] } as RollbackSelection))
}

mock.module('../rollback-prompt', () => mockPrompt)

describe('RollbackPlugin Interactive', () => {
  const originalCI = process.env.CI
  
  beforeEach(() => {
    mockSnapshots.rollbackToSnapshot.mockClear()
    mockSnapshots.rollbackFiles.mockClear()
    mockPrompt.promptForRollback.mockClear()
    process.env.LOOPWORK_NON_INTERACTIVE = 'false'
    process.env.CI = 'false'
  })

  // Restore env after tests
  const afterAll = require('bun:test').afterAll
  if (afterAll) {
    afterAll(() => {
      process.env.CI = originalCI
    })
  }

  const context = {
    task: { id: 'TASK-1' },
    retryAttempt: 0
  } as unknown as TaskContext

  test('should use interactive prompt when enabled and changes exist', async () => {
    const plugin = createRollbackPlugin({ 
      enabled: true, 
      interactive: true,
      rollbackOnFailure: true 
    })

    if (plugin.onTaskStart) await plugin.onTaskStart(context)

    if (plugin.onTaskFailed) await plugin.onTaskFailed(context, 'error')

    expect(mockPrompt.promptForRollback).toHaveBeenCalled()
    expect(mockSnapshots.getChangesSinceSnapshot).toHaveBeenCalled()
  })

  test('should perform selective rollback when chosen', async () => {
    const plugin = createRollbackPlugin({ 
      enabled: true, 
      interactive: true
    })
    
    mockPrompt.promptForRollback.mockResolvedValueOnce({ action: 'selective', files: ['file1.ts'] })

    if (plugin.onTaskStart) await plugin.onTaskStart(context)
    if (plugin.onTaskFailed) await plugin.onTaskFailed(context, 'error')

    expect(mockSnapshots.rollbackFiles).toHaveBeenCalledWith(expect.any(Object), ['file1.ts'])
    expect(mockSnapshots.rollbackToSnapshot).not.toHaveBeenCalled()
  })

  test('should perform full rollback when "all" chosen', async () => {
    const plugin = createRollbackPlugin({ 
      enabled: true, 
      interactive: true
    })
    
    mockPrompt.promptForRollback.mockResolvedValueOnce({ action: 'all' } as RollbackSelection)

    if (plugin.onTaskStart) await plugin.onTaskStart(context)
    if (plugin.onTaskFailed) await plugin.onTaskFailed(context, 'error')

    expect(mockSnapshots.rollbackToSnapshot).toHaveBeenCalled()
    expect(mockSnapshots.rollbackFiles).not.toHaveBeenCalled()
  })

  test('should skip rollback when "none" chosen', async () => {
    const plugin = createRollbackPlugin({ 
      enabled: true, 
      interactive: true
    })
    
    mockPrompt.promptForRollback.mockResolvedValueOnce({ action: 'none' } as RollbackSelection)

    if (plugin.onTaskStart) await plugin.onTaskStart(context)
    if (plugin.onTaskFailed) await plugin.onTaskFailed(context, 'error')

    expect(mockSnapshots.rollbackToSnapshot).not.toHaveBeenCalled()
    expect(mockSnapshots.rollbackFiles).not.toHaveBeenCalled()
  })

  test('should fallback to auto-rollback if non-interactive', async () => {
    process.env.LOOPWORK_NON_INTERACTIVE = 'true'
    const plugin = createRollbackPlugin({ 
      enabled: true, 
      interactive: true,
      rollbackOnFailure: true
    })
    
    if (plugin.onTaskStart) await plugin.onTaskStart(context)
    if (plugin.onTaskFailed) await plugin.onTaskFailed(context, 'error')

    expect(mockPrompt.promptForRollback).not.toHaveBeenCalled()
    expect(mockSnapshots.rollbackToSnapshot).toHaveBeenCalled()
  })
})
