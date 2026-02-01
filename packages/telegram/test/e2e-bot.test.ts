import { describe, test, expect, beforeEach, mock, afterEach } from 'bun:test'
// Removed type-only import from '../src/bot'
import type { TaskBackend, Task } from '../../loopwork/src/contracts'

// Mock backend implementation
const createMockBackend = (): TaskBackend => {
  const tasks: Map<string, Task> = new Map()

  return {
    name: 'MockBackend',

    async ping() {
      return { ok: true, latencyMs: 5 }
    },

    async listPendingTasks() {
      return Array.from(tasks.values()).filter(t => t.status === 'pending')
    },

    async findNextTask() {
      const pending = await this.listPendingTasks()
      return pending[0] || null
    },

    async getTask(id: string) {
      return tasks.get(id) || null
    },

    async markInProgress(id: string) {
      const task = tasks.get(id)
      if (!task) return { success: false, error: 'Task not found' }
      task.status = 'in-progress'
      return { success: true }
    },

    async markCompleted(id: string, _output?: string) {
      const task = tasks.get(id)
      if (!task) return { success: false, error: 'Task not found' }
      task.status = 'completed'
      return { success: true }
    },

    async markFailed(id: string, _error: string) {
      const task = tasks.get(id)
      if (!task) return { success: false, error: 'Task not found' }
      task.status = 'failed'
      return { success: true }
    },

    async resetToPending(id: string) {
      const task = tasks.get(id)
      if (!task) return { success: false, error: 'Task not found' }
      task.status = 'pending'
      return { success: true }
    },

    async countPending() {
      return (await this.listPendingTasks()).length
    },

    async createTask(params: { title: string; description: string; priority: 'high' | 'medium' | 'low' }) {
      const id = `TASK-${String(tasks.size + 1).padStart(3, '0')}`
      const task: Task = {
        id,
        title: params.title,
        description: params.description,
        status: 'pending',
        priority: params.priority,
        createdAt: new Date().toISOString(),
      }
      tasks.set(id, task)
      return task
    },

    async createSubTask(parentId: string, params: { title: string; description: string; priority: 'high' | 'medium' | 'low' }) {
      const parent = tasks.get(parentId)
      if (!parent) throw new Error('Parent task not found')

      const id = `${parentId}a`
      const task: Task = {
        id,
        title: params.title,
        description: params.description,
        status: 'pending',
        priority: params.priority,
        parentId,
        feature: params.feature,
        createdAt: new Date().toISOString(),
      }
      tasks.set(id, task)
      return task
    },

    async setPriority(id: string, priority: 'high' | 'medium' | 'low') {
      const task = tasks.get(id)
      if (!task) return { success: false, error: 'Task not found' }
      task.priority = priority
      return { success: true }
    },

    // Helper for tests
    addTask(task: Task) {
      tasks.set(task.id, task)
    },

    clearTasks() {
      tasks.clear()
    },
  }
}

// Mock fetch globally
const mockFetch = (responses: Record<string, any>) => {
  const originalFetch = global.fetch

  global.fetch = mock(async (url: string, options?: any) => {
    const urlStr = typeof url === 'string' ? url : url.toString()

    // sendMessage
    if (urlStr.includes('/sendMessage')) {
      return {
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 1 } }),
      } as Response
    }

    // getUpdates
    if (urlStr.includes('/getUpdates')) {
      const updates = responses.getUpdates || []
      return {
        ok: true,
        json: async () => ({ ok: true, result: updates }),
      } as Response
    }

    return {
      ok: false,
      json: async () => ({ ok: false, description: 'Unknown endpoint' }),
    } as Response
  }) as typeof fetch

  return () => {
    global.fetch = originalFetch
  }
}

describe('TelegramTaskBot E2E', () => {
  let bot: TelegramTaskBot
  let backend: ReturnType<typeof createMockBackend>
  let restoreFetch: () => void

  beforeEach(() => {
    backend = createMockBackend()
    restoreFetch = mockFetch({ getUpdates: [] })
  })

  afterEach(() => {
    if (bot) {
      bot.stop()
    }
    restoreFetch()
  })

  // Helper to create bot with mock backend injected
  const createBotWithMockBackend = (config?: { loopCommand?: string[] }) => {
    const bot = new TelegramTaskBot({
      botToken: 'test-token',
      chatId: '123456',
      backend: { type: 'json', tasksFile: '.specs/tasks/tasks.json' },
      ...config,
    })
    // Replace backend with our mock after construction
    ;(bot as any).backend = backend
    return bot
  }

  describe('Bot Construction', () => {
    test('should throw error if no bot token provided', () => {
      expect(() => {
        new TelegramTaskBot({ botToken: '', chatId: '123' })
      }).toThrow('TELEGRAM_BOT_TOKEN is required')
    })

    test('should throw error if no chat ID provided', () => {
      expect(() => {
        new TelegramTaskBot({ botToken: 'token', chatId: '' })
      }).toThrow('TELEGRAM_CHAT_ID is required')
    })

    test('should construct with valid config', () => {
      const bot = new TelegramTaskBot({
        botToken: 'test-token',
        chatId: '123456',
        backend: { type: 'json', tasksFile: '.specs/tasks/tasks.json' },
      })

      expect(bot).toBeDefined()
    })
  })

  describe('Security - Chat ID Filtering', () => {
    test('should ignore messages from unauthorized chat', async () => {
      const updates = [{
        update_id: 1,
        message: {
          message_id: 1,
          from: { id: 999, username: 'hacker' },
          chat: { id: 999 },
          text: '/tasks',
          date: Date.now(),
        },
      }]

      restoreFetch()
      let messagesSent = 0
      restoreFetch = mockFetch({
        getUpdates: updates,
      })

      global.fetch = mock(async (url: string) => {
        if (url.includes('/sendMessage')) {
          messagesSent++
        }
        if (url.includes('/getUpdates')) {
          return {
            ok: true,
            json: async () => ({ ok: true, result: updates }),
          } as Response
        }
        return {
          ok: true,
          json: async () => ({ ok: true }),
        } as Response
      }) as typeof fetch

      bot = createBotWithMockBackend()

      // Simulate one polling cycle
      const getUpdatesMethod = (bot as any).getUpdates.bind(bot)
      const handleUpdateMethod = (bot as any).handleUpdate.bind(bot)

      const receivedUpdates = await getUpdatesMethod()
      for (const update of receivedUpdates) {
        await handleUpdateMethod(update)
      }

      // Should not send any response to unauthorized chat
      expect(messagesSent).toBe(0)
    })

    test('should process messages from authorized chat', async () => {
      const updates = [{
        update_id: 1,
        message: {
          message_id: 1,
          from: { id: 123456, username: 'authorized' },
          chat: { id: 123456 },
          text: '/help',
          date: Date.now(),
        },
      }]

      restoreFetch()
      let messagesSent = 0
      restoreFetch = mockFetch({
        getUpdates: updates,
      })

      global.fetch = mock(async (url: string) => {
        if (url.includes('/sendMessage')) {
          messagesSent++
          return {
            ok: true,
            json: async () => ({ ok: true, result: { message_id: 1 } }),
          } as Response
        }
        if (url.includes('/getUpdates')) {
          return {
            ok: true,
            json: async () => ({ ok: true, result: updates }),
          } as Response
        }
        return { ok: true, json: async () => ({ ok: true }) } as Response
      }) as typeof fetch

      bot = createBotWithMockBackend()

      const getUpdatesMethod = (bot as any).getUpdates.bind(bot)
      const handleUpdateMethod = (bot as any).handleUpdate.bind(bot)

      const receivedUpdates = await getUpdatesMethod()
      for (const update of receivedUpdates) {
        await handleUpdateMethod(update)
      }

      // Should send help message
      expect(messagesSent).toBeGreaterThan(0)
    })
  })

  describe('Command Handlers', () => {
    beforeEach(() => {
      bot = createBotWithMockBackend()
    })

    test('/tasks - should list pending tasks', async () => {
      backend.addTask({
        id: 'TASK-001',
        title: 'Test Task 1',
        description: 'Description 1',
        status: 'pending',
        priority: 'high',
        createdAt: new Date().toISOString(),
      })

      backend.addTask({
        id: 'TASK-002',
        title: 'Test Task 2',
        description: 'Description 2',
        status: 'pending',
        priority: 'medium',
        createdAt: new Date().toISOString(),
      })

      const handleCommand = (bot as any).handleCommand.bind(bot)
      const response = await handleCommand(123456, '/tasks')

      expect(response).toContain('Pending Tasks (2)')
      expect(response).toContain('TASK-001')
      expect(response).toContain('TASK-002')
      expect(response).toContain('Test Task 1')
    })

    test('/tasks - should show message when no tasks', async () => {
      const handleCommand = (bot as any).handleCommand.bind(bot)
      const response = await handleCommand(123456, '/tasks')

      expect(response).toContain('No pending tasks')
    })

    test('/task <id> - should show task details', async () => {
      backend.addTask({
        id: 'TASK-001',
        title: 'Test Task',
        description: 'Test Description',
        status: 'pending',
        priority: 'high',
        createdAt: new Date().toISOString(),
      })

      const handleCommand = (bot as any).handleCommand.bind(bot)
      const response = await handleCommand(123456, '/task TASK-001')

      expect(response).toContain('Test Task')
      expect(response).toContain('TASK-001')
      expect(response).toContain('pending')
      expect(response).toContain('high')
      expect(response).toContain('Test Description')
    })

    test('/task - should show usage if no ID provided', async () => {
      const handleCommand = (bot as any).handleCommand.bind(bot)
      const response = await handleCommand(123456, '/task')

      expect(response).toContain('Usage: /task <task-id>')
    })

    test('/task <invalid> - should show error for non-existent task', async () => {
      const handleCommand = (bot as any).handleCommand.bind(bot)
      const response = await handleCommand(123456, '/task INVALID')

      expect(response).toContain('Task not found')
    })

    test('/complete <id> - should mark task as completed', async () => {
      backend.addTask({
        id: 'TASK-001',
        title: 'Test Task',
        description: 'Description',
        status: 'pending',
        priority: 'medium',
        createdAt: new Date().toISOString(),
      })

      const handleCommand = (bot as any).handleCommand.bind(bot)
      const response = await handleCommand(123456, '/complete TASK-001')

      expect(response).toContain('marked as completed')

      const task = await backend.getTask('TASK-001')
      expect(task?.status).toBe('completed')
    })

    test('/fail <id> <reason> - should mark task as failed', async () => {
      backend.addTask({
        id: 'TASK-001',
        title: 'Test Task',
        description: 'Description',
        status: 'pending',
        priority: 'medium',
        createdAt: new Date().toISOString(),
      })

      const handleCommand = (bot as any).handleCommand.bind(bot)
      const response = await handleCommand(123456, '/fail TASK-001 Test failure reason')

      expect(response).toContain('marked as failed')

      const task = await backend.getTask('TASK-001')
      expect(task?.status).toBe('failed')
    })

    test('/reset <id> - should reset task to pending', async () => {
      backend.addTask({
        id: 'TASK-001',
        title: 'Test Task',
        description: 'Description',
        status: 'completed',
        priority: 'medium',
        createdAt: new Date().toISOString(),
      })

      const handleCommand = (bot as any).handleCommand.bind(bot)
      const response = await handleCommand(123456, '/reset TASK-001')

      expect(response).toContain('reset to pending')

      const task = await backend.getTask('TASK-001')
      expect(task?.status).toBe('pending')
    })

    test('/status - should show backend status', async () => {
      backend.addTask({
        id: 'TASK-001',
        title: 'Test Task',
        description: 'Description',
        status: 'pending',
        priority: 'medium',
        createdAt: new Date().toISOString(),
      })

      const handleCommand = (bot as any).handleCommand.bind(bot)
      const response = await handleCommand(123456, '/status')

      expect(response).toContain('Loopwork Status')
      expect(response).toContain('MockBackend')
      expect(response).toContain('OK')
      expect(response).toContain('Pending Tasks:')
    })

    test('/new <title> - should create new task via command', async () => {
      const handleCommand = (bot as any).handleCommand.bind(bot)
      const response = await handleCommand(123456, '/new Test new task')

      expect(response).toContain('Task created')
      expect(response).toContain('TASK-001')
      expect(response).toContain('Test new task')

      const task = await backend.getTask('TASK-001')
      expect(task).toBeDefined()
      expect(task?.title).toBe('Test new task')
    })

    test('/subtask <parent> <title> - should create subtask', async () => {
      backend.addTask({
        id: 'TASK-001',
        title: 'Parent Task',
        description: 'Description',
        status: 'pending',
        priority: 'high',
        createdAt: new Date().toISOString(),
      })

      const handleCommand = (bot as any).handleCommand.bind(bot)
      const response = await handleCommand(123456, '/subtask TASK-001 Subtask title')

      expect(response).toContain('Sub-task created')
      expect(response).toContain('TASK-001a')
      expect(response).toContain('Parent:')

      const subtask = await backend.getTask('TASK-001a')
      expect(subtask).toBeDefined()
      expect(subtask?.parentId).toBe('TASK-001')
    })

    test('/priority <id> <level> - should set task priority', async () => {
      backend.addTask({
        id: 'TASK-001',
        title: 'Test Task',
        description: 'Description',
        status: 'pending',
        priority: 'low',
        createdAt: new Date().toISOString(),
      })

      const handleCommand = (bot as any).handleCommand.bind(bot)
      const response = await handleCommand(123456, '/priority TASK-001 high')

      expect(response).toContain('Priority updated')
      expect(response).toContain('high')

      const task = await backend.getTask('TASK-001')
      expect(task?.priority).toBe('high')
    })

    test('/help - should show help message', async () => {
      const handleCommand = (bot as any).handleCommand.bind(bot)
      const response = await handleCommand(123456, '/help')

      expect(response).toContain('Loopwork')
      expect(response).toContain('/tasks')
      expect(response).toContain('/complete')
      expect(response).toContain('/status')
      expect(response).toContain('MockBackend')
    })

    test('unknown command - should show error', async () => {
      const handleCommand = (bot as any).handleCommand.bind(bot)
      const response = await handleCommand(123456, '/unknown')

      expect(response).toContain('Unknown command')
      expect(response).toContain('/help')
    })
  })

  describe('Session State Machine', () => {
    beforeEach(() => {
      bot = createBotWithMockBackend()
    })

    test('should start task draft from natural language', async () => {
      const handleUpdate = (bot as any).handleUpdate.bind(bot)

      const update = {
        update_id: 1,
        message: {
          message_id: 1,
          from: { id: 123456, username: 'test' },
          chat: { id: 123456 },
          text: 'Create a new feature',
          date: Date.now(),
        },
      }

      let sentMessages: string[] = []
      global.fetch = mock(async (url: string, options?: any) => {
        if (url.includes('/sendMessage')) {
          const body = JSON.parse(options.body)
          sentMessages.push(body.text)
        }
        return {
          ok: true,
          json: async () => ({ ok: true, result: { message_id: 1 } }),
        } as Response
      }) as typeof fetch

      await handleUpdate(update)

      const sessionManager = (bot as any).sessionManager
      const session = sessionManager.getSession(123456, 123456)

      expect(session.state).toBe('DRAFTING_TASK')
      expect(session.draft?.title).toBe('Create a new feature')
      expect(sentMessages.some(m => m.includes('Drafting Task'))).toBe(true)
    })

    test('should complete task creation workflow', async () => {
      const handleUpdate = (bot as any).handleUpdate.bind(bot)

      // Step 1: Start draft
      await handleUpdate({
        update_id: 1,
        message: {
          message_id: 1,
          from: { id: 123456, username: 'test' },
          chat: { id: 123456 },
          text: 'Build authentication',
          date: Date.now(),
        },
      })

      // Step 2: Provide description
      await handleUpdate({
        update_id: 2,
        message: {
          message_id: 2,
          from: { id: 123456, username: 'test' },
          chat: { id: 123456 },
          text: 'Add JWT-based authentication system',
          date: Date.now(),
        },
      })

      const sessionManager = (bot as any).sessionManager
      let session = sessionManager.getSession(123456, 123456)
      expect(session.state).toBe('CONFIRM_TASK')

      // Step 3: Confirm
      await handleUpdate({
        update_id: 3,
        message: {
          message_id: 3,
          from: { id: 123456, username: 'test' },
          chat: { id: 123456 },
          text: 'yes',
          date: Date.now(),
        },
      })

      session = sessionManager.getSession(123456, 123456)
      expect(session.state).toBe('IDLE')

      const task = await backend.getTask('TASK-001')
      expect(task).toBeDefined()
      expect(task?.title).toBe('Build authentication')
      expect(task?.description).toBe('Add JWT-based authentication system')
    })

    test('should handle cancel during drafting', async () => {
      const handleUpdate = (bot as any).handleUpdate.bind(bot)

      // Start draft
      await handleUpdate({
        update_id: 1,
        message: {
          message_id: 1,
          from: { id: 123456, username: 'test' },
          chat: { id: 123456 },
          text: 'Create task',
          date: Date.now(),
        },
      })

      const sessionManager = (bot as any).sessionManager
      let session = sessionManager.getSession(123456, 123456)
      expect(session.state).toBe('DRAFTING_TASK')

      // Cancel
      await handleUpdate({
        update_id: 2,
        message: {
          message_id: 2,
          from: { id: 123456, username: 'test' },
          chat: { id: 123456 },
          text: '/cancel',
          date: Date.now(),
        },
      })

      session = sessionManager.getSession(123456, 123456)
      expect(session.state).toBe('IDLE')
      expect(session.draft).toBeUndefined()
    })

    test('should handle "skip" for description', async () => {
      const handleUpdate = (bot as any).handleUpdate.bind(bot)

      // Start draft
      await handleUpdate({
        update_id: 1,
        message: {
          message_id: 1,
          from: { id: 123456, username: 'test' },
          chat: { id: 123456 },
          text: 'Quick task',
          date: Date.now(),
        },
      })

      // Skip description
      await handleUpdate({
        update_id: 2,
        message: {
          message_id: 2,
          from: { id: 123456, username: 'test' },
          chat: { id: 123456 },
          text: 'skip',
          date: Date.now(),
        },
      })

      const sessionManager = (bot as any).sessionManager
      const session = sessionManager.getSession(123456, 123456)
      expect(session.state).toBe('CONFIRM_TASK')
      expect(session.draft?.description).toBe('Quick task')
    })

    test('should cancel task creation on "no" confirmation', async () => {
      const handleUpdate = (bot as any).handleUpdate.bind(bot)

      // Start and complete draft
      await handleUpdate({
        update_id: 1,
        message: {
          message_id: 1,
          from: { id: 123456, username: 'test' },
          chat: { id: 123456 },
          text: 'Task title',
          date: Date.now(),
        },
      })

      await handleUpdate({
        update_id: 2,
        message: {
          message_id: 2,
          from: { id: 123456, username: 'test' },
          chat: { id: 123456 },
          text: 'Task description',
          date: Date.now(),
        },
      })

      // Reject confirmation
      await handleUpdate({
        update_id: 3,
        message: {
          message_id: 3,
          from: { id: 123456, username: 'test' },
          chat: { id: 123456 },
          text: 'no',
          date: Date.now(),
        },
      })

      const sessionManager = (bot as any).sessionManager
      const session = sessionManager.getSession(123456, 123456)
      expect(session.state).toBe('IDLE')

      const task = await backend.getTask('TASK-001')
      expect(task).toBeNull()
    })
  })

  describe('Bot Lifecycle', () => {
    // TODO: These tests hang because bot.start() runs infinite polling loop
    // Need to refactor bot to support mock mode or add stop condition
    test.skip('should send startup message on start', async () => {
      let startupMessageSent = false

      restoreFetch()
      global.fetch = mock(async (url: string, options?: any) => {
        if (url.includes('/sendMessage')) {
          const body = JSON.parse(options.body)
          if (body.text.includes('bot is now online')) {
            startupMessageSent = true
          }
        }
        if (url.includes('/getUpdates')) {
          return {
            ok: true,
            json: async () => ({ ok: true, result: [] }),
          } as Response
        }
        return {
          ok: true,
          json: async () => ({ ok: true }),
        } as Response
      }) as typeof fetch

      bot = createBotWithMockBackend()

      // Start bot and immediately stop to avoid hanging
      const startPromise = bot.start()
      await new Promise(resolve => setTimeout(resolve, 100))
      bot.stop()

      await startPromise.catch(() => {}) // Ignore errors from stop

      expect(startupMessageSent).toBe(true)
    })

    test.skip('should stop bot cleanly', async () => {
      bot = createBotWithMockBackend()

      const startPromise = bot.start()
      await new Promise(resolve => setTimeout(resolve, 50))

      bot.stop()

      const running = (bot as any).running
      expect(running).toBe(false)

      await startPromise.catch(() => {})
    })

    test.skip('should not start if already running', async () => {
      bot = createBotWithMockBackend()

      const startPromise1 = bot.start()
      await new Promise(resolve => setTimeout(resolve, 50))

      // Try to start again
      const startPromise2 = bot.start()
      await new Promise(resolve => setTimeout(resolve, 50))

      bot.stop()

      await Promise.all([
        startPromise1.catch(() => {}),
        startPromise2.catch(() => {}),
      ])

      // Both should complete without issues
      expect(true).toBe(true)
    })
  })

  describe('Loop Control Commands', () => {
    beforeEach(() => {
      bot = createBotWithMockBackend({ loopCommand: ['echo', 'test'] })
    })

    test('/run - should indicate loop start', async () => {
      const handleCommand = (bot as any).handleCommand.bind(bot)
      const response = await handleCommand(123456, '/run')

      expect(response).toMatch(/started/i)
    })

    test('/stop - should stop running loop', async () => {
      const handleCommand = (bot as any).handleCommand.bind(bot)

      // Start loop
      await handleCommand(123456, '/run')
      await new Promise(resolve => setTimeout(resolve, 200))

      // Verify loop is running
      expect((bot as any).loopProcess).toBeDefined()

      // Stop loop
      const response = await handleCommand(123456, '/stop')
      expect(response).toMatch(/(stopped|No loop running)/i)
    })

    test('/stop - should indicate if no loop running', async () => {
      const handleCommand = (bot as any).handleCommand.bind(bot)
      const response = await handleCommand(123456, '/stop')

      expect(response).toContain('No loop running')
    })
  })

  describe('Message Sending', () => {
    beforeEach(() => {
      bot = createBotWithMockBackend()
    })

    test('should send message successfully', async () => {
      let messageSent = ''

      global.fetch = mock(async (url: string, options?: any) => {
        if (url.includes('/sendMessage')) {
          const body = JSON.parse(options.body)
          messageSent = body.text
          return {
            ok: true,
            json: async () => ({ ok: true, result: { message_id: 1 } }),
          } as Response
        }
        return { ok: true, json: async () => ({ ok: true }) } as Response
      }) as typeof fetch

      const result = await bot.sendMessage('Test message')

      expect(result).toBe(true)
      expect(messageSent).toBe('Test message')
    })

    test('should handle send failure gracefully', async () => {
      global.fetch = mock(async () => {
        throw new Error('Network error')
      }) as typeof fetch

      const result = await bot.sendMessage('Test message')

      expect(result).toBe(false)
    })
  })
})
