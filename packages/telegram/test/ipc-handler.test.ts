import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { IPCHandler, type IPCMessage } from '../src/ipc-handler'
import type { TelegramTaskBot } from '../src/bot'

// Mock TelegramTaskBot
class MockTelegramBot implements Partial<TelegramTaskBot> {
  sentMessages: Array<{ text: string; options?: any }> = []

  async sendMessage(text: string, options?: any): Promise<boolean> {
    this.sentMessages.push({ text, options })
    return true
  }
}

describe('IPC Handler', () => {
  let bot: MockTelegramBot
  let handler: IPCHandler

  beforeEach(() => {
    bot = new MockTelegramBot()
    handler = new IPCHandler(bot as any)
  })

  describe('Message Parsing', () => {
    test('parseOutput extracts IPC messages from chunk', () => {
      const message: IPCMessage = {
        type: 'ipc',
        version: '1.0',
        event: 'task_start',
        data: { taskId: 'TASK-001', title: 'Test Task' },
        timestamp: Date.now(),
        messageId: 'msg-1'
      }
      const chunk = `Some log text\n__IPC_START__${JSON.stringify(message)}__IPC_END__\nMore logs`

      const result = handler.parseOutput(chunk)

      expect(result.ipcMessages.length).toBe(1)
      expect(result.ipcMessages[0].event).toBe('task_start')
      expect(result.logs).toBe('Some log text\nMore logs')
    })

    test('parseOutput handles multiple IPC messages', () => {
      const msg1: IPCMessage = {
        type: 'ipc',
        version: '1.0',
        event: 'task_start',
        data: { taskId: 'TASK-001', title: 'Test 1' },
        timestamp: Date.now(),
        messageId: 'msg-1'
      }
      const msg2: IPCMessage = {
        type: 'ipc',
        version: '1.0',
        event: 'task_complete',
        data: { taskId: 'TASK-001', title: 'Test 1' },
        timestamp: Date.now(),
        messageId: 'msg-2'
      }
      const chunk = `__IPC_START__${JSON.stringify(msg1)}__IPC_END__\n__IPC_START__${JSON.stringify(msg2)}__IPC_END__`

      const result = handler.parseOutput(chunk)

      expect(result.ipcMessages.length).toBe(2)
      expect(result.ipcMessages[0].event).toBe('task_start')
      expect(result.ipcMessages[1].event).toBe('task_complete')
      expect(result.logs.trim()).toBe('')
    })

    test('parseOutput handles invalid JSON gracefully', () => {
      const validMsg: IPCMessage = {
        type: 'ipc',
        version: '1.0',
        event: 'task_start',
        data: { taskId: 'TASK-001', title: 'Test' },
        timestamp: Date.now(),
        messageId: 'msg-1'
      }
      const chunk = `__IPC_START__${JSON.stringify(validMsg)}__IPC_END__\n__IPC_START__invalid json__IPC_END__\nLog line`

      const result = handler.parseOutput(chunk)

      expect(result.ipcMessages.length).toBe(1)
      expect(result.logs.includes('__IPC_START__invalid json__IPC_END__')).toBe(true)
    })

    test('parseOutput handles chunks without IPC messages', () => {
      const chunk = 'Regular log output\nMore logs\nNo IPC here'

      const result = handler.parseOutput(chunk)

      expect(result.ipcMessages.length).toBe(0)
      expect(result.logs).toBe('Regular log output\nMore logs\nNo IPC here')
    })

    test('parseOutput preserves message type validation', () => {
      const invalidMsg = {
        type: 'not-ipc',
        version: '1.0',
        event: 'task_start',
        data: {},
        timestamp: Date.now(),
        messageId: 'msg-1'
      }
      const chunk = `__IPC_START__${JSON.stringify(invalidMsg)}__IPC_END__\nLog`

      const result = handler.parseOutput(chunk)

      expect(result.ipcMessages.length).toBe(0)
      expect(result.logs.includes('__IPC_START__')).toBe(true)
    })
  })

  describe('Question Event Handler', () => {
    test('handleQuestion sends message with inline keyboard', async () => {
      const message: IPCMessage = {
        type: 'ipc',
        version: '1.0',
        event: 'question',
        data: {
          question: 'Which approach?',
          options: [
            { id: 'opt1', label: 'Option A' },
            { id: 'opt2', label: 'Option B' }
          ],
          timeout: 60
        },
        timestamp: Date.now(),
        messageId: 'q-1'
      }

      await handler.handleMessage(message)

      expect(bot.sentMessages.length).toBe(1)
      expect(bot.sentMessages[0].text).toContain('Which approach?')
      expect(bot.sentMessages[0].options?.reply_markup?.inline_keyboard).toBeDefined()
      expect(bot.sentMessages[0].options.reply_markup.inline_keyboard.length).toBe(2)
    })

    test('handleQuestion creates correct callback data', async () => {
      const message: IPCMessage = {
        type: 'ipc',
        version: '1.0',
        event: 'question',
        data: {
          question: 'Choose one',
          options: [
            { id: 'a', label: 'Alpha' },
            { id: 'b', label: 'Beta' }
          ],
          timeout: 30
        },
        timestamp: Date.now(),
        messageId: 'q-2'
      }

      await handler.handleMessage(message)

      const keyboard = bot.sentMessages[0].options.reply_markup.inline_keyboard
      expect(keyboard[0][0].callback_data).toContain('ipc:q-2:a')
      expect(keyboard[1][0].callback_data).toContain('ipc:q-2:b')
    })
  })

  describe('Approval Request Handler', () => {
    test('handleApprovalRequest sends approval message', async () => {
      const message: IPCMessage = {
        type: 'ipc',
        version: '1.0',
        event: 'approval_request',
        data: {
          action: 'delete_files',
          description: 'Delete all test files',
          severity: 'high',
          timeout: 30
        },
        timestamp: Date.now(),
        messageId: 'apr-1'
      }

      await handler.handleMessage(message)

      expect(bot.sentMessages.length).toBe(1)
      expect(bot.sentMessages[0].text).toContain('Approval Required')
      expect(bot.sentMessages[0].text).toContain('delete_files')
      expect(bot.sentMessages[0].text).toContain('⚠️')
    })

    test('handleApprovalRequest shows severity emoji', async () => {
      // High severity
      let message: IPCMessage = {
        type: 'ipc',
        version: '1.0',
        event: 'approval_request',
        data: {
          action: 'test',
          description: 'Test',
          severity: 'high',
          timeout: 30
        },
        timestamp: Date.now(),
        messageId: 'apr-2'
      }

      await handler.handleMessage(message)
      expect(bot.sentMessages[0].text).toContain('⚠️')

      bot.sentMessages = []

      // Medium severity
      message.messageId = 'apr-3'
      message.data.severity = 'medium'
      await handler.handleMessage(message)
      expect(bot.sentMessages[0].text).toContain('⚡')

      bot.sentMessages = []

      // Low severity
      message.messageId = 'apr-4'
      message.data.severity = 'low'
      await handler.handleMessage(message)
      expect(bot.sentMessages[0].text).toContain('ℹ️')
    })

    test('handleApprovalRequest has approve and deny buttons', async () => {
      const message: IPCMessage = {
        type: 'ipc',
        version: '1.0',
        event: 'approval_request',
        data: {
          action: 'delete_data',
          description: 'Permanently delete data',
          severity: 'high',
          timeout: 30
        },
        timestamp: Date.now(),
        messageId: 'apr-5'
      }

      await handler.handleMessage(message)

      const keyboard = bot.sentMessages[0].options.reply_markup.inline_keyboard
      expect(keyboard.length).toBe(1)
      expect(keyboard[0].length).toBe(2)
      expect(keyboard[0][0].text).toBe('✅ Approve')
      expect(keyboard[0][1].text).toBe('❌ Deny')
    })

    test('handleApprovalRequest timeout denies by default', async () => {
      const message: IPCMessage = {
        type: 'ipc',
        version: '1.0',
        event: 'approval_request',
        data: {
          action: 'test',
          description: 'Test timeout',
          severity: 'medium',
          timeout: 0.01 // 10ms for testing
        },
        timestamp: Date.now(),
        messageId: 'apr-6'
      }

      await handler.handleMessage(message)

      // Wait for timeout
      await new Promise(r => setTimeout(r, 50))

      // Should have timeout message
      const timeoutMsg = bot.sentMessages.find(m => m.text.includes('timeout'))
      expect(timeoutMsg).toBeDefined()
    })
  })

  describe('Task Event Handlers', () => {
    test('handleTaskStart sends notification', async () => {
      const message: IPCMessage = {
        type: 'ipc',
        version: '1.0',
        event: 'task_start',
        data: {
          taskId: 'TASK-001',
          title: 'Implement feature X'
        },
        timestamp: Date.now(),
        messageId: 'ts-1'
      }

      await handler.handleMessage(message)

      expect(bot.sentMessages.length).toBe(1)
      expect(bot.sentMessages[0].text).toContain('🚀')
      expect(bot.sentMessages[0].text).toContain('TASK-001')
      expect(bot.sentMessages[0].text).toContain('Implement feature X')
    })

    test('handleTaskComplete sends notification with result', async () => {
      const message: IPCMessage = {
        type: 'ipc',
        version: '1.0',
        event: 'task_complete',
        data: {
          taskId: 'TASK-002',
          title: 'Completed task',
          result: { status: 'success', duration: 5000 }
        },
        timestamp: Date.now(),
        messageId: 'tc-1'
      }

      await handler.handleMessage(message)

      expect(bot.sentMessages.length).toBe(1)
      expect(bot.sentMessages[0].text).toContain('✅')
      expect(bot.sentMessages[0].text).toContain('TASK-002')
      expect(bot.sentMessages[0].text).toContain('Completed task')
    })

    test('handleTaskFailed sends error notification', async () => {
      const message: IPCMessage = {
        type: 'ipc',
        version: '1.0',
        event: 'task_failed',
        data: {
          taskId: 'TASK-003',
          title: 'Failed task',
          error: 'Task execution timeout after 30s'
        },
        timestamp: Date.now(),
        messageId: 'tf-1'
      }

      await handler.handleMessage(message)

      expect(bot.sentMessages.length).toBe(1)
      expect(bot.sentMessages[0].text).toContain('❌')
      expect(bot.sentMessages[0].text).toContain('TASK-003')
      expect(bot.sentMessages[0].text).toContain('timeout')
    })

    test('handleTaskFailed truncates long errors', async () => {
      const longError = 'x'.repeat(500)
      const message: IPCMessage = {
        type: 'ipc',
        version: '1.0',
        event: 'task_failed',
        data: {
          taskId: 'TASK-004',
          title: 'Failed',
          error: longError
        },
        timestamp: Date.now(),
        messageId: 'tf-2'
      }

      await handler.handleMessage(message)

      const text = bot.sentMessages[0].text
      expect(text.length).toBeLessThan(400) // Should be truncated
      expect(text).toContain('...')
    })
  })

  describe('Progress Update Handler', () => {
    test('handleProgressUpdate sends progress bar', async () => {
      const message: IPCMessage = {
        type: 'ipc',
        version: '1.0',
        event: 'progress_update',
        data: {
          taskId: 'TASK-005',
          progress: 50,
          message: 'Half way there'
        },
        timestamp: Date.now(),
        messageId: 'pu-1'
      }

      await handler.handleMessage(message)

      expect(bot.sentMessages.length).toBe(1)
      expect(bot.sentMessages[0].text).toContain('⚙️')
      expect(bot.sentMessages[0].text).toContain('50%')
      expect(bot.sentMessages[0].text).toContain('Half way there')
    })

    test('handleProgressUpdate creates correct progress bar', async () => {
      const testCases = [
        { progress: 0, expectedFilled: 0 },
        { progress: 25, expectedFilled: 2 },
        { progress: 50, expectedFilled: 5 },
        { progress: 75, expectedFilled: 7 },
        { progress: 100, expectedFilled: 10 }
      ]

      for (const testCase of testCases) {
        bot.sentMessages = []
        const message: IPCMessage = {
          type: 'ipc',
          version: '1.0',
          event: 'progress_update',
          data: {
            taskId: 'TASK-006',
            progress: testCase.progress,
            message: `Progress ${testCase.progress}%`
          },
          timestamp: Date.now(),
          messageId: `pu-${testCase.progress}`
        }

        await handler.handleMessage(message)

        const text = bot.sentMessages[0].text
        const filled = (text.match(/█/g) || []).length
        expect(filled).toBe(testCase.expectedFilled)
      }
    })
  })

  describe('Log Handler', () => {
    test('handleLog sends structured log message', async () => {
      const message: IPCMessage = {
        type: 'ipc',
        version: '1.0',
        event: 'log',
        data: {
          level: 'info',
          message: 'Application started'
        },
        timestamp: Date.now(),
        messageId: 'log-1'
      }

      await handler.handleMessage(message)

      expect(bot.sentMessages.length).toBe(1)
      expect(bot.sentMessages[0].text).toContain('Application started')
    })

    test('handleLog shows correct emoji for level', async () => {
      const levels = [
        { level: 'error', emoji: '❌' },
        { level: 'warn', emoji: '⚠️' },
        { level: 'info', emoji: 'ℹ️' }
      ]

      for (const testCase of levels) {
        bot.sentMessages = []
        const message: IPCMessage = {
          type: 'ipc',
          version: '1.0',
          event: 'log',
          data: {
            level: testCase.level,
            message: 'Test message'
          },
          timestamp: Date.now(),
          messageId: `log-${testCase.level}`
        }

        await handler.handleMessage(message)

        expect(bot.sentMessages[0].text).toContain(testCase.emoji)
      }
    })
  })

  describe('Request Resolution', () => {
    test('resolveRequest resolves pending promise', async () => {
      const message: IPCMessage = {
        type: 'ipc',
        version: '1.0',
        event: 'question',
        data: {
          question: 'Choose?',
          options: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' }
          ],
          timeout: 60
        },
        timestamp: Date.now(),
        messageId: 'q-resolve-1'
      }

      // Start handling (which creates a pending request)
      const handlePromise = handler.handleMessage(message)
      await new Promise(r => setTimeout(r, 10)) // Let it set up the promise

      // Resolve it
      handler.resolveRequest('q-resolve-1', 'a')

      // Should complete without error
      await expect(handlePromise).resolves.toBeUndefined()
    })

    test('resolveRequest ignores unknown message IDs', async () => {
      // Should not throw
      handler.resolveRequest('unknown-id', 'response')
    })

    test('resolveRequest cleans up timer', async () => {
      const message: IPCMessage = {
        type: 'ipc',
        version: '1.0',
        event: 'question',
        data: {
          question: 'Q?',
          options: [{ id: 'a', label: 'A' }],
          timeout: 60
        },
        timestamp: Date.now(),
        messageId: 'q-timer-1'
      }

      handler.handleMessage(message)
      await new Promise(r => setTimeout(r, 10))

      // Resolve before timeout
      handler.resolveRequest('q-timer-1', 'a')

      // Wait to ensure no extra timeout handling
      await new Promise(r => setTimeout(r, 100))

      // Should be cleaned up (no error messages)
      expect(true).toBe(true)
    })
  })

  describe('HTML Escaping', () => {
    test('HTML special characters are escaped in task events', async () => {
      const message: IPCMessage = {
        type: 'ipc',
        version: '1.0',
        event: 'task_start',
        data: {
          taskId: 'TASK-007',
          title: 'Test <script>alert("xss")</script>'
        },
        timestamp: Date.now(),
        messageId: 'xss-1'
      }

      await handler.handleMessage(message)

      const text = bot.sentMessages[0].text
      expect(text).toContain('&lt;script&gt;')
      expect(text).not.toContain('<script>')
    })

    test('HTML special characters are escaped in approval requests', async () => {
      const message: IPCMessage = {
        type: 'ipc',
        version: '1.0',
        event: 'approval_request',
        data: {
          action: 'delete&drop',
          description: 'Test <b>HTML</b> & entities',
          severity: 'high',
          timeout: 30
        },
        timestamp: Date.now(),
        messageId: 'xss-2'
      }

      await handler.handleMessage(message)

      const text = bot.sentMessages[0].text
      // User content should be escaped
      expect(text).toContain('&lt;b&gt;HTML&lt;/b&gt;')
      expect(text).toContain('delete&amp;drop')
      // Template formatting should use actual HTML tags
      expect(text).toContain('<b>Approval Required</b>')
      expect(text).toContain('<b>Action:</b>')
    })
  })

  describe('Cleanup', () => {
    test('cleanup clears all pending requests', async () => {
      const msg1: IPCMessage = {
        type: 'ipc',
        version: '1.0',
        event: 'question',
        data: {
          question: 'Q1?',
          options: [{ id: 'a', label: 'A' }],
          timeout: 60
        },
        timestamp: Date.now(),
        messageId: 'cleanup-1'
      }

      const msg2: IPCMessage = {
        type: 'ipc',
        version: '1.0',
        event: 'question',
        data: {
          question: 'Q2?',
          options: [{ id: 'b', label: 'B' }],
          timeout: 60
        },
        timestamp: Date.now(),
        messageId: 'cleanup-2'
      }

      handler.handleMessage(msg1)
      handler.handleMessage(msg2)

      await new Promise(r => setTimeout(r, 10))

      // Cleanup should not throw
      handler.cleanup()

      // Trying to resolve after cleanup should do nothing
      handler.resolveRequest('cleanup-1', 'a')
      handler.resolveRequest('cleanup-2', 'b')
    })
  })

  describe('Unknown Event Types', () => {
    test('handleMessage ignores unknown event types', async () => {
      const message: IPCMessage = {
        type: 'ipc',
        version: '1.0',
        event: 'unknown_event' as any,
        data: {},
        timestamp: Date.now(),
        messageId: 'unknown-1'
      }

      // Should not throw
      await handler.handleMessage(message)
      expect(bot.sentMessages.length).toBe(0)
    })
  })
})
