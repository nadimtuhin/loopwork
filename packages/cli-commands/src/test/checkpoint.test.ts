import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { CheckpointCommand } from '../checkpoint'
import type { CommandContext } from '@loopwork-ai/contracts'
import type { ICheckpointManager } from '@loopwork-ai/checkpoint'

describe('CheckpointCommand', () => {
  let command: CheckpointCommand
  let mockContext: CommandContext
  let mockManager: ICheckpointManager
  let mockStorage: any

  beforeEach(() => {
    command = new CheckpointCommand()
    mockManager = {
      checkpoint: mock(async () => {}),
      restore: mock(async () => null),
      clear: mock(async () => {}),
      onEvent: mock(async () => {}),
      list: mock(async () => []),
      cleanup: mock(async () => 0),
    } as unknown as ICheckpointManager
    
    mockContext = {
      logger: {
        info: mock(() => {}),
        warn: mock(() => {}),
        error: mock(() => {}),
        success: mock(() => {}),
        debug: mock(() => {}),
        raw: mock(() => {}),
        trace: mock(() => {}),
        update: mock(() => {}),
        startSpinner: mock(() => {}),
        stopSpinner: mock(() => {}),
        setLogLevel: mock(() => {}),
      },
      fs: {} as any,
      path: {} as any,
      process: {} as any,
      deps: {
        checkpointManager: mockManager,
      },
    }
  })

  test('name is checkpoint', () => {
    expect(command.name).toBe('checkpoint')
  })

  test('list subcommands shows checkpoints', async () => {
    mockManager.list = mock(async () => ['cp-1', 'cp-2'])
    mockManager.restore = mock(async (id: string) => ({
      checkpoint: {
        agentId: id,
        taskId: 'TASK-1',
        phase: 'executing' as any,
        iteration: 1,
        timestamp: new Date(),
      },
      partialOutput: '',
    }))

    const result = await command.execute(mockContext, { subcommand: 'list' })

    expect(result.success).toBe(true)
    expect(mockContext.logger.raw).toHaveBeenCalled()
    expect(mockManager.list).toHaveBeenCalled()
  })

  test('show subcommand displays details', async () => {
    const cp = {
      agentId: 'cp-1',
      taskId: 'TASK-1',
      phase: 'completed',
      iteration: 5,
      timestamp: new Date(),
      state: { foo: 'bar' },
    }
    mockManager.restore = mock(async () => ({
      checkpoint: cp,
      partialOutput: 'some output',
    }))

    const result = await command.execute(mockContext, { subcommand: 'show', args: ['cp-1'] })

    expect(result.success).toBe(true)
    expect(mockManager.restore).toHaveBeenCalledWith('cp-1')
    expect(mockContext.logger.raw).toHaveBeenCalled()
  })

  test('delete subcommand clears checkpoint', async () => {
    mockManager.list = mock(async () => ['cp-1'])
    
    const result = await command.execute(mockContext, { subcommand: 'delete', args: ['cp-1'] })

    expect(result.success).toBe(true)
    expect(mockManager.clear).toHaveBeenCalledWith('cp-1')
    expect(mockContext.logger.success).toHaveBeenCalled()
  })

  test('cleanup subcommand calls manager cleanup', async () => {
    mockManager.cleanup = mock(async () => 5)

    const result = await command.execute(mockContext, { subcommand: 'cleanup', maxAgeDays: 7 })

    expect(result.success).toBe(true)
    expect(mockManager.cleanup).toHaveBeenCalledWith(7)
    expect(mockContext.logger.success).toHaveBeenCalled()
  })

  test('fails if checkpoint manager not available', async () => {
    mockContext.deps = {}
    const result = await command.execute(mockContext, { subcommand: 'list' })
    expect(result.success).toBe(false)
    expect(result.message).toBe('Checkpoint manager not available')
  })

  test('fails on unknown subcommand', async () => {
    const result = await command.execute(mockContext, { subcommand: 'unknown' })
    expect(result.success).toBe(false)
    expect(result.message).toBe('Unknown subcommand: unknown')
  })
})
