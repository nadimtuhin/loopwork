import { describe, it, expect, mock } from 'bun:test'
import type { CommandContext, CommandOptions } from '@loopwork-ai/contracts'
import { RescheduleCommand, createRescheduleCommand } from '../reschedule'

function createMockContext(overrides?: { deps?: Record<string, unknown> }): CommandContext {
  const mockLogger = {
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
    success: mock(() => {}),
    raw: mock(() => {}),
  }

  const mockFs = {
    existsSync: mock(() => false),
    readFileSync: mock(() => ''),
    writeFileSync: mock(() => {}),
    readdirSync: mock(() => []),
    mkdirSync: mock(() => {}),
  }

  const mockPath = {
    join: mock((...paths: string[]) => paths.join('/')),
    dirname: mock((path: string) => path.split('/').slice(0, -1).join('/')),
    basename: mock((path: string) => path.split('/').pop() || ''),
    relative: mock((_from: string, to: string) => to),
  }

  const mockProcess = {
    cwd: mock(() => '/test'),
    exit: mock(() => {}),
    env: {},
    isCI: mock(() => false),
    isTTY: mock(() => true),
  }

  return {
    logger: mockLogger as unknown as CommandContext['logger'],
    fs: mockFs as unknown as CommandContext['fs'],
    path: mockPath as unknown as CommandContext['path'],
    process: mockProcess as unknown as CommandContext['process'],
    deps: overrides?.deps,
  }
}

describe('RescheduleCommand', () => {
  describe('command properties', () => {
    it('should have correct name', () => {
      const command = new RescheduleCommand()
      expect(command.name).toBe('reschedule')
    })

    it('should have description', () => {
      const command = new RescheduleCommand()
      expect(command.description).toBe('Reschedule completed tasks back to pending status')
    })

    it('should have usage', () => {
      const command = new RescheduleCommand()
      expect(command.usage).toBe('[task-id] [options]')
    })

    it('should have examples', () => {
      const command = new RescheduleCommand()
      expect(command.examples).toBeInstanceOf(Array)
      expect(command.examples.length).toBeGreaterThan(0)
    })

    it('should have seeAlso references', () => {
      const command = new RescheduleCommand()
      expect(command.seeAlso).toContain('loopwork run')
      expect(command.seeAlso).toContain('loopwork start')
    })
  })

  describe('validate', () => {
    it('should return error when both id and --all are specified', () => {
      const command = new RescheduleCommand()
      const result = command.validate?.({ id: 'TASK-001', all: true } as CommandOptions)
      expect(result).toBe('Cannot specify both task ID and --all flag')
    })

    it('should return error when both id and --feature are specified', () => {
      const command = new RescheduleCommand()
      const result = command.validate?.({ id: 'TASK-001', feature: 'auth' } as CommandOptions)
      expect(result).toBe('Cannot specify both task ID and --feature flag')
    })

    it('should return error for invalid datetime format', () => {
      const command = new RescheduleCommand()
      const result = command.validate?.({ for: 'invalid-date' } as CommandOptions)
      expect(result).toContain('Invalid datetime format')
    })

    it('should return undefined for valid options', () => {
      const command = new RescheduleCommand()
      expect(command.validate?.({} as CommandOptions)).toBeUndefined()
      expect(command.validate?.({ all: true } as CommandOptions)).toBeUndefined()
      expect(command.validate?.({ for: '2025-02-01T12:00:00Z' } as CommandOptions)).toBeUndefined()
    })
  })

  describe('execute', () => {
    it('should return error when backend is not available', async () => {
      const command = new RescheduleCommand()
      const context = createMockContext()

      const result = await command.execute(context, { id: 'TASK-001' } as CommandOptions)

      expect(result.success).toBe(false)
      expect(result.code).toBe(1)
      expect(result.message).toBe('Backend not available')
    })

    it('should reschedule a single task successfully', async () => {
      const command = new RescheduleCommand()
      const context = createMockContext({
        deps: {
          backend: {
            name: 'json',
            rescheduleCompleted: mock(async (_taskId: string) => {
              return { success: true }
            }),
          },
        },
      })

      const result = await command.execute(context, { id: 'TASK-001' } as CommandOptions)

      expect(result.success).toBe(true)
      expect(result.code).toBe(0)
      expect(result.data.taskId).toBe('TASK-001')
    })

    it('should handle reschedule failure', async () => {
      const command = new RescheduleCommand()
      const context = createMockContext({
        deps: {
          backend: {
            name: 'json',
            rescheduleCompleted: mock(async (_taskId: string) => {
              return { success: false, error: 'Task not found' }
            }),
          },
        },
      })

      const result = await command.execute(context, { id: 'TASK-001' } as CommandOptions)

      expect(result.success).toBe(false)
      expect(result.code).toBe(1)
      expect(result.message).toContain('Task not found')
    })

    it('should handle --all flag for multiple tasks', async () => {
      const command = new RescheduleCommand()
      const context = createMockContext({
        deps: {
          backend: {
            name: 'json',
            listTasks: mock(async () => [
              { id: 'TASK-001' },
              { id: 'TASK-002' },
            ]),
            rescheduleCompleted: mock(async (_taskId: string) => {
              return { success: true }
            }),
          },
        },
      })

      const result = await command.execute(context, { all: true } as CommandOptions)

      expect(result.success).toBe(true)
      expect(result.code).toBe(0)
      expect(result.data.successCount).toBe(2)
      expect(result.data.failCount).toBe(0)
    })

    it('should handle partial failures with --all', async () => {
      const command = new RescheduleCommand()
      let callCount = 0
      const context = createMockContext({
        deps: {
          backend: {
            name: 'json',
            listTasks: mock(async () => [
              { id: 'TASK-001' },
              { id: 'TASK-002' },
            ]),
            rescheduleCompleted: mock(async (_taskId: string) => {
              callCount++
              return { success: callCount === 1 }
            }),
          },
        },
      })

      const result = await command.execute(context, { all: true } as CommandOptions)

      expect(result.success).toBe(false)
      expect(result.code).toBe(1)
      expect(result.data.successCount).toBe(1)
      expect(result.data.failCount).toBe(1)
    })

    it('should return success when no completed tasks found with --all', async () => {
      const command = new RescheduleCommand()
      const context = createMockContext({
        deps: {
          backend: {
            name: 'json',
            listTasks: mock(async () => []),
          },
        },
      })

      const result = await command.execute(context, { all: true } as CommandOptions)

      expect(result.success).toBe(true)
      expect(result.code).toBe(0)
      expect(result.message).toBe('No completed tasks found to reschedule')
    })

    it('should filter by feature with --feature flag', async () => {
      const command = new RescheduleCommand()
      const listTasksMock = mock(async (options: { status: string; feature?: string }) => {
        expect(options.feature).toBe('auth')
        return [{ id: 'TASK-001' }]
      })

      const context = createMockContext({
        deps: {
          backend: {
            name: 'json',
            listTasks: listTasksMock,
            rescheduleCompleted: mock(async () => ({ success: true })),
          },
        },
      })

      const result = await command.execute(context, { feature: 'auth' } as CommandOptions)

      expect(result.success).toBe(true)
    })

    it('should validate datetime format', async () => {
      const command = new RescheduleCommand()
      const context = createMockContext({
        deps: {
          backend: {
            name: 'json',
            rescheduleCompleted: mock(async () => ({ success: true })),
          },
        },
      })

      const result = await command.execute(context, { id: 'TASK-001', for: 'invalid-date' } as CommandOptions)

      expect(result.success).toBe(false)
      expect(result.code).toBe(1)
      expect(result.message).toContain('Invalid datetime format')
    })

    it('should throw error when no id, all, or feature is provided', async () => {
      const command = new RescheduleCommand()
      const context = createMockContext({
        deps: {
          backend: { name: 'json' },
        },
      })

      const result = await command.execute(context, {} as CommandOptions)

      expect(result.success).toBe(false)
      expect(result.message).toContain('Task ID is required')
    })

    it('should throw error when backend does not support rescheduling', async () => {
      const command = new RescheduleCommand()
      const context = createMockContext({
        deps: {
          backend: { name: 'json' },
        },
      })

      const result = await command.execute(context, { id: 'TASK-001' } as CommandOptions)

      expect(result.success).toBe(false)
      expect(result.message).toContain('Backend does not support rescheduling')
    })

    it('should throw error when backend does not support listing tasks', async () => {
      const command = new RescheduleCommand()
      const context = createMockContext({
        deps: {
          backend: { name: 'json' },
        },
      })

      const result = await command.execute(context, { all: true } as CommandOptions)

      expect(result.success).toBe(false)
      expect(result.message).toContain('Backend does not support listing tasks')
    })

    it('should include scheduledFor in result when specified', async () => {
      const command = new RescheduleCommand()
      const context = createMockContext({
        deps: {
          backend: {
            name: 'json',
            rescheduleCompleted: mock(async () => ({ success: true })),
          },
        },
      })

      const result = await command.execute(
        context,
        { id: 'TASK-001', for: '2025-02-01T12:00:00Z' } as CommandOptions
      )

      expect(result.success).toBe(true)
      expect(result.data.scheduledFor).toBe('2025-02-01T12:00:00Z')
    })
  })

  describe('createRescheduleCommand', () => {
    it('should create a RescheduleCommand instance', () => {
      const command = createRescheduleCommand()
      expect(command).toBeInstanceOf(RescheduleCommand)
      expect(command.name).toBe('reschedule')
    })
  })
})
