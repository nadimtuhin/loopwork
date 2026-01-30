import { describe, expect, test, beforeEach } from 'bun:test'
import { createIPCPlugin, withIPC } from '../src/plugins/ipc'
import type { IPCMessage, IPCEventType, IPCWriteFn } from '../src/plugins/ipc'
import type { TaskContext, PluginTaskResult, LoopStats } from '../src/contracts/plugin'

describe('IPC Plugin', () => {
  let capturedOutput: string[] = []
  let mockWriteFn: IPCWriteFn

  beforeEach(() => {
    capturedOutput = []
    mockWriteFn = (msg: string) => {
      capturedOutput.push(msg)
    }
  })

  describe('Plugin creation', () => {
    test('creates plugin with default options', () => {
      const plugin = createIPCPlugin()
      expect(plugin.name).toBe('ipc-emitter')
      expect(typeof plugin.onLoopStart).toBe('function')
      expect(typeof plugin.onLoopEnd).toBe('function')
      expect(typeof plugin.onTaskStart).toBe('function')
      expect(typeof plugin.onTaskComplete).toBe('function')
      expect(typeof plugin.onTaskFailed).toBe('function')
    })

    test('creates plugin with custom options', () => {
      const plugin = createIPCPlugin({
        enabled: false,
        filter: (event) => event === 'task_start'
      })
      expect(plugin.name).toBe('ipc-emitter')
    })

    test('withIPC creates plugin', () => {
      const plugin = withIPC()
      expect(plugin.name).toBe('ipc-emitter')
    })
  })

  describe('IPC message emission', () => {
    test('emits loop_start event', () => {
      const plugin = createIPCPlugin({ writeFn: mockWriteFn })
      plugin.onLoopStart!('test-namespace')

      expect(capturedOutput.length).toBe(1)
      const message = parseIPCMessage(capturedOutput[0])

      expect(message.type).toBe('ipc')
      expect(message.version).toBe('1.0')
      expect(message.event).toBe('loop_start')
      expect(message.data.namespace).toBe('test-namespace')
      expect(message.messageId).toBeTruthy()
      expect(message.timestamp).toBeGreaterThan(0)
    })

    test('emits loop_end event', () => {
      const plugin = createIPCPlugin({ writeFn: mockWriteFn })
      const stats: LoopStats = {
        completed: 5,
        failed: 1,
        duration: 120000
      }

      plugin.onLoopEnd!(stats)

      expect(capturedOutput.length).toBe(1)
      const message = parseIPCMessage(capturedOutput[0])

      expect(message.event).toBe('loop_end')
      expect(message.data.completed).toBe(5)
      expect(message.data.failed).toBe(1)
      expect(message.data.duration).toBe(120000)
    })

    test('emits task_start event', () => {
      const plugin = createIPCPlugin({ writeFn: mockWriteFn })
      const context: TaskContext = {
        task: {
          id: 'TASK-001',
          title: 'Test task',
          status: 'in-progress',
          priority: 'medium'
        },
        namespace: 'test',
        iteration: 1,
        startTime: new Date()
      }

      plugin.onTaskStart!(context)

      expect(capturedOutput.length).toBe(1)
      const message = parseIPCMessage(capturedOutput[0])

      expect(message.event).toBe('task_start')
      expect(message.data.taskId).toBe('TASK-001')
      expect(message.data.title).toBe('Test task')
      expect(message.data.namespace).toBe('test')
      expect(message.data.iteration).toBe(1)
    })

    test('emits task_complete event', () => {
      const plugin = createIPCPlugin({ writeFn: mockWriteFn })
      const context: TaskContext = {
        task: {
          id: 'TASK-002',
          title: 'Completed task',
          status: 'completed',
          priority: 'high'
        },
        namespace: 'test',
        iteration: 2,
        startTime: new Date()
      }
      const result: PluginTaskResult = {
        duration: 5000,
        success: true,
        output: 'Task completed successfully'
      }

      plugin.onTaskComplete!(context, result)

      expect(capturedOutput.length).toBe(1)
      const message = parseIPCMessage(capturedOutput[0])

      expect(message.event).toBe('task_complete')
      expect(message.data.taskId).toBe('TASK-002')
      expect(message.data.title).toBe('Completed task')
      expect(message.data.duration).toBe(5000)
      expect(message.data.success).toBe(true)
    })

    test('emits task_failed event', () => {
      const plugin = createIPCPlugin({ writeFn: mockWriteFn })
      const context: TaskContext = {
        task: {
          id: 'TASK-003',
          title: 'Failed task',
          status: 'failed',
          priority: 'low'
        },
        namespace: 'test',
        iteration: 3,
        startTime: new Date()
      }
      const error = 'Task execution failed: timeout'

      plugin.onTaskFailed!(context, error)

      expect(capturedOutput.length).toBe(1)
      const message = parseIPCMessage(capturedOutput[0])

      expect(message.event).toBe('task_failed')
      expect(message.data.taskId).toBe('TASK-003')
      expect(message.data.error).toBe('Task execution failed: timeout')
    })
  })

  describe('Message format', () => {
    test('uses correct wrapper format', () => {
      const plugin = createIPCPlugin({ writeFn: mockWriteFn })
      plugin.onLoopStart!('test')

      const output = capturedOutput[0]
      expect(output.startsWith('__IPC_START__')).toBe(true)
      expect(output.endsWith('__IPC_END__\n')).toBe(true)
    })

    test('generates unique message IDs', () => {
      const plugin = createIPCPlugin({ writeFn: mockWriteFn })

      plugin.onLoopStart!('test1')
      plugin.onLoopStart!('test2')

      const msg1 = parseIPCMessage(capturedOutput[0])
      const msg2 = parseIPCMessage(capturedOutput[1])

      expect(msg1.messageId).not.toBe(msg2.messageId)
    })

    test('includes timestamps', () => {
      const plugin = createIPCPlugin({ writeFn: mockWriteFn })
      const before = Date.now()

      plugin.onLoopStart!('test')

      const after = Date.now()
      const message = parseIPCMessage(capturedOutput[0])

      expect(message.timestamp).toBeGreaterThanOrEqual(before)
      expect(message.timestamp).toBeLessThanOrEqual(after)
    })
  })

  describe('Plugin options', () => {
    test('respects enabled flag', () => {
      const plugin = createIPCPlugin({ enabled: false, writeFn: mockWriteFn })
      plugin.onLoopStart!('test')

      expect(capturedOutput.length).toBe(0)
    })

    test('applies event filter', () => {
      const plugin = createIPCPlugin({
        filter: (event) => event === 'task_start',
        writeFn: mockWriteFn
      })

      plugin.onLoopStart!('test')
      plugin.onLoopEnd!({ completed: 0, failed: 0, duration: 0 })

      const context: TaskContext = {
        task: {
          id: 'TASK-001',
          title: 'Test',
          status: 'in-progress',
          priority: 'medium'
        },
        namespace: 'test',
        iteration: 1,
        startTime: new Date()
      }
      plugin.onTaskStart!(context)

      // Only task_start should be emitted
      expect(capturedOutput.length).toBe(1)
      const message = parseIPCMessage(capturedOutput[0])
      expect(message.event).toBe('task_start')
    })

    test('filter receives correct event type', () => {
      const receivedEvents: IPCEventType[] = []
      const plugin = createIPCPlugin({
        filter: (event) => {
          receivedEvents.push(event)
          return true
        },
        writeFn: mockWriteFn
      })

      plugin.onLoopStart!('test')
      plugin.onLoopEnd!({ completed: 0, failed: 0, duration: 0 })

      expect(receivedEvents).toEqual(['loop_start', 'loop_end'])
    })
  })

  describe('JSON serialization', () => {
    test('handles complex data structures', () => {
      const plugin = createIPCPlugin({ writeFn: mockWriteFn })
      const stats: LoopStats = {
        completed: 10,
        failed: 2,
        duration: 300000
      }

      plugin.onLoopEnd!(stats)

      const message = parseIPCMessage(capturedOutput[0])
      expect(message.data).toEqual(stats)
    })

    test('handles empty data', () => {
      const plugin = createIPCPlugin({ writeFn: mockWriteFn })
      plugin.onLoopStart!('')

      const message = parseIPCMessage(capturedOutput[0])
      expect(message.data.namespace).toBe('')
    })
  })
})

/**
 * Helper to parse IPC message from captured output
 */
function parseIPCMessage(output: string): IPCMessage {
  const match = output.match(/__IPC_START__(.*)__IPC_END__/)
  if (!match) {
    throw new Error('Invalid IPC message format')
  }
  return JSON.parse(match[1])
}
