import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { createIPCPlugin } from '../../src/plugins/ipc'
import type { TaskContext, PluginTaskResult } from '../../src/contracts/plugin'

describe('IPCPlugin', () => {
  let writeFn: any
  let plugin: any

  beforeEach(() => {
    writeFn = mock(() => {})
    plugin = createIPCPlugin({ writeFn })
  })

  test('should emit task_start event', async () => {
    const context = {
      task: { id: 'TASK-001', title: 'Test Task' },
      namespace: 'default',
      iteration: 1
    } as TaskContext

    await plugin.onTaskStart(context)

    expect(writeFn).toHaveBeenCalled()
    const call = writeFn.mock.calls[0][0]
    expect(call).toContain('__IPC_START__')
    expect(call).toContain('__IPC_END__')
    
    const message = JSON.parse(call.replace('__IPC_START__', '').replace('__IPC_END__\n', ''))
    expect(message.event).toBe('task_start')
    expect(message.data.taskId).toBe('TASK-001')
  })

  test('should emit task_complete event', async () => {
    const context = {
      task: { id: 'TASK-001', title: 'Test Task' },
      namespace: 'default',
      iteration: 1
    } as TaskContext
    const result = { duration: 100, success: true } as PluginTaskResult

    await plugin.onTaskComplete(context, result)

    const call = writeFn.mock.calls[0][0]
    const message = JSON.parse(call.replace('__IPC_START__', '').replace('__IPC_END__\n', ''))
    expect(message.event).toBe('task_complete')
    expect(message.data.duration).toBe(100)
  })

  test('should emit progress_update on certain steps', async () => {
    const event = {
      stepId: 'cli_spawn_start',
      description: 'Spawning CLI',
      phase: 'start',
      context: { taskId: 'TASK-001' }
    } as any

    await plugin.onStep(event)

    const call = writeFn.mock.calls[0][0]
    const message = JSON.parse(call.replace('__IPC_START__', '').replace('__IPC_END__\n', ''))
    expect(message.event).toBe('progress_update')
    expect(message.data.stepId).toBe('cli_spawn_start')
  })

  test('should respect enabled option', async () => {
    const disabledPlugin = createIPCPlugin({ enabled: false, writeFn })
    if (disabledPlugin.onTaskStart) {
      await disabledPlugin.onTaskStart({ task: { id: '1' } } as any)
    }
    expect(writeFn).not.toHaveBeenCalled()
  })
})
