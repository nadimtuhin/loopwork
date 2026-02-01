import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { createRollbackPlugin } from '../../src/plugins/rollback'
import * as snapshots from '../../src/utils/git-snapshots'
import type { TaskContext, PluginTaskResult } from '../../src/contracts'

mock.module('../../src/utils/git-snapshots', () => ({
  takeSnapshot: mock(async () => ({ id: 'snap1', hash: 'abc' })),
  rollbackToSnapshot: mock(async () => true),
}))

describe('Rollback Plugin', () => {
  const mockContext: any = {
    task: { id: 'TASK-001' },
    iteration: 1
  }

  beforeEach(() => {
    const mockedSnapshots = require('../../src/utils/git-snapshots')
    mockedSnapshots.takeSnapshot.mockClear()
    mockedSnapshots.rollbackToSnapshot.mockClear()
  })

  test('should take snapshot on task start', async () => {
    const plugin = createRollbackPlugin({ enabled: true })
    const { takeSnapshot } = require('../../src/utils/git-snapshots')

    await plugin.onTaskStart!(mockContext)

    expect(takeSnapshot).toHaveBeenCalledWith(mockContext)
  })

  test('should rollback on task failure if enabled', async () => {
    const plugin = createRollbackPlugin({ enabled: true, rollbackOnFailure: true })
    const { rollbackToSnapshot } = require('../../src/utils/git-snapshots')

    await plugin.onTaskStart!(mockContext)
    
    await plugin.onTaskFailed!(mockContext, 'error')

    expect(rollbackToSnapshot).toHaveBeenCalled()
  })

  test('should NOT rollback on task failure if disabled', async () => {
    const plugin = createRollbackPlugin({ enabled: true, rollbackOnFailure: false })
    const { rollbackToSnapshot } = require('../../src/utils/git-snapshots')

    await plugin.onTaskStart!(mockContext)
    await plugin.onTaskFailed!(mockContext, 'error')

    expect(rollbackToSnapshot).not.toHaveBeenCalled()
  })

  test('should NOT rollback if plugin is disabled', async () => {
    const plugin = createRollbackPlugin({ enabled: false })
    const { takeSnapshot, rollbackToSnapshot } = require('../../src/utils/git-snapshots')

    await plugin.onTaskStart!(mockContext)
    expect(takeSnapshot).not.toHaveBeenCalled()

    await plugin.onTaskFailed!(mockContext, 'error')
    expect(rollbackToSnapshot).not.toHaveBeenCalled()
  })

  test('should clean up snapshot reference on completion', async () => {
    const plugin = createRollbackPlugin({ enabled: true })
    const { rollbackToSnapshot } = require('../../src/utils/git-snapshots')

    await plugin.onTaskStart!(mockContext)
    
    const result: PluginTaskResult = { duration: 1, success: true }
    await plugin.onTaskComplete!(mockContext, result)
    
    await plugin.onTaskFailed!(mockContext, 'error')

    expect(rollbackToSnapshot).not.toHaveBeenCalled()
  })

  test('should rollback on retry if enabled', async () => {
    const plugin = createRollbackPlugin({ enabled: true, rollbackOnRetry: true })
    const { rollbackToSnapshot } = require('../../src/utils/git-snapshots')

    await plugin.onTaskStart!(mockContext)
    await plugin.onTaskRetry!(mockContext, 'error')

    expect(rollbackToSnapshot).toHaveBeenCalled()
  })

  test('should NOT take multiple snapshots during retries', async () => {
    const plugin = createRollbackPlugin({ enabled: true })
    const { takeSnapshot } = require('../../src/utils/git-snapshots')

    await plugin.onTaskStart!(mockContext)
    expect(takeSnapshot).toHaveBeenCalledTimes(1)

    const retryContext = { ...mockContext, retryAttempt: 1 }
    await plugin.onTaskStart!(retryContext)
    expect(takeSnapshot).toHaveBeenCalledTimes(1) // Still 1
  })

  test('should rollback on abort if enabled', async () => {
    const plugin = createRollbackPlugin({ enabled: true, rollbackOnAbort: true })
    const { rollbackToSnapshot } = require('../../src/utils/git-snapshots')

    await plugin.onTaskStart!(mockContext)
    await plugin.onTaskAbort!(mockContext)

    expect(rollbackToSnapshot).toHaveBeenCalled()
  })
})
