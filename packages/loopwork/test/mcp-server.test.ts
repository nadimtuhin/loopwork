import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import type { Task, TaskBackend, FindTaskOptions, UpdateResult, PingResult } from '../src/backends/types'
import { LoopworkMcpServer } from '../src/mcp/server'

/**
 * MCP Server Tests
 *
 * Tests for the MCP (Model Context Protocol) server implementation.
 * Covers all MCP protocol methods and tool calls.
 */

describe('MCP Server', () => {
  let server: LoopworkMcpServer
  let mockBackend: TaskBackend

  // Sample test tasks
  const mockTasks: Task[] = [
    {
      id: 'TASK-001',
      title: 'Implement authentication',
      description: 'Add user authentication with JWT',
      status: 'pending',
      priority: 'high',
      feature: 'auth',
    },
    {
      id: 'TASK-002',
      title: 'Add user dashboard',
      description: 'Create dashboard UI',
      status: 'in-progress',
      priority: 'medium',
      feature: 'ui',
    },
    {
      id: 'TASK-003',
      title: 'Write unit tests',
      description: 'Add test coverage',
      status: 'pending',
      priority: 'low',
      dependsOn: ['TASK-001'],
    },
    {
      id: 'TASK-001a',
      title: 'Setup JWT library',
      description: 'Install and configure JWT',
      status: 'pending',
      priority: 'high',
      feature: 'auth',
      parentId: 'TASK-001',
    },
  ]

  beforeEach(() => {
    // Create mock backend
    mockBackend = {
      name: 'mock-backend',

      async findNextTask(options?: FindTaskOptions): Promise<Task | null> {
        let filtered = mockTasks.filter(t => t.status === 'pending')

        if (options?.feature) {
          filtered = filtered.filter(t => t.feature === options.feature)
        }
        if (options?.priority) {
          filtered = filtered.filter(t => t.priority === options.priority)
        }
        if (options?.topLevelOnly) {
          filtered = filtered.filter(t => !t.parentId)
        }
        if (!options?.includeBlocked) {
          filtered = filtered.filter(t => !t.dependsOn || t.dependsOn.length === 0)
        }

        return filtered[0] || null
      },

      async getTask(taskId: string): Promise<Task | null> {
        return mockTasks.find(t => t.id === taskId) || null
      },

      async listPendingTasks(options?: FindTaskOptions): Promise<Task[]> {
        let filtered = mockTasks.filter(t => t.status === 'pending')

        if (options?.feature) {
          filtered = filtered.filter(t => t.feature === options.feature)
        }
        if (options?.priority) {
          filtered = filtered.filter(t => t.priority === options.priority)
        }
        if (options?.topLevelOnly) {
          filtered = filtered.filter(t => !t.parentId)
        }
        if (!options?.includeBlocked) {
          filtered = filtered.filter(t => !t.dependsOn || t.dependsOn.length === 0)
        }

        return filtered
      },

      async countPending(options?: FindTaskOptions): Promise<number> {
        const tasks = await mockBackend.listPendingTasks(options)
        return tasks.length
      },

      async markInProgress(taskId: string): Promise<UpdateResult> {
        const task = mockTasks.find(t => t.id === taskId)
        if (!task) {
          return { success: false, error: 'Task not found' }
        }
        task.status = 'in-progress'
        return { success: true }
      },

      async markCompleted(taskId: string, comment?: string): Promise<UpdateResult> {
        const task = mockTasks.find(t => t.id === taskId)
        if (!task) {
          return { success: false, error: 'Task not found' }
        }
        task.status = 'completed'
        return { success: true }
      },

      async markFailed(taskId: string, error: string): Promise<UpdateResult> {
        const task = mockTasks.find(t => t.id === taskId)
        if (!task) {
          return { success: false, error: 'Task not found' }
        }
        task.status = 'failed'
        return { success: true }
      },

      async markQuarantined(taskId: string, reason: string): Promise<UpdateResult> {
        const task = mockTasks.find(t => t.id === taskId)
        if (!task) {
          return { success: false, error: 'Task not found' }
        }
        task.status = 'quarantined'
        return { success: true }
      },

      async resetToPending(taskId: string): Promise<UpdateResult> {
        const task = mockTasks.find(t => t.id === taskId)
        if (!task) {
          return { success: false, error: 'Task not found' }
        }
        task.status = 'pending'
        return { success: true }
      },

      async ping(): Promise<PingResult> {
        return { ok: true, latencyMs: 5 }
      },

      async getSubTasks(taskId: string): Promise<Task[]> {
        return mockTasks.filter(t => t.parentId === taskId)
      },

      async getDependencies(taskId: string): Promise<Task[]> {
        const task = mockTasks.find(t => t.id === taskId)
        if (!task || !task.dependsOn) {
          return []
        }
        return mockTasks.filter(t => task.dependsOn!.includes(t.id))
      },

      async getDependents(taskId: string): Promise<Task[]> {
        return mockTasks.filter(t => t.dependsOn?.includes(taskId))
      },

      async areDependenciesMet(taskId: string): Promise<boolean> {
        const task = mockTasks.find(t => t.id === taskId)
        if (!task || !task.dependsOn || task.dependsOn.length === 0) {
          return true
        }

        const deps = await mockBackend.getDependencies(taskId)
        return deps.every(d => d.status === 'completed')
      },
    }

    // Create server instance with injected mock backend
    server = new LoopworkMcpServer(mockBackend)
  })

  afterEach(() => {
    // Reset task statuses for next test
    mockTasks.forEach(t => {
      if (t.id === 'TASK-001') t.status = 'pending'
      if (t.id === 'TASK-002') t.status = 'in-progress'
      if (t.id === 'TASK-003') t.status = 'pending'
      if (t.id === 'TASK-001a') t.status = 'pending'
    })
  })

  describe('MCP Protocol - Initialize', () => {
    test('handles initialize request', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'initialize',
        params: {},
      }

      // @ts-ignore - Accessing private method for testing
      const response = await server.handleRequest(request)

      expect(response.jsonrpc).toBe('2.0')
      expect(response.id).toBe(1)
      expect(response.result).toBeDefined()
      expect(response.result).toHaveProperty('protocolVersion', '2024-11-05')
      expect(response.result).toHaveProperty('capabilities')
      expect(response.result).toHaveProperty('serverInfo')
      expect((response.result as any).serverInfo.name).toBe('loopwork-tasks')
      expect((response.result as any).serverInfo.version).toBe('1.0.0')
    })
  })

  describe('MCP Protocol - Tools List', () => {
    test('handles tools/list request', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 2,
        method: 'tools/list',
      }

      // @ts-ignore - Accessing private method for testing
      const response = await server.handleRequest(request)

      expect(response.jsonrpc).toBe('2.0')
      expect(response.id).toBe(2)
      expect(response.result).toBeDefined()
      expect((response.result as any).tools).toBeArray()
      expect((response.result as any).tools.length).toBeGreaterThan(0)

      // Check that all expected tools are present
      const tools = (response.result as any).tools
      const toolNames = tools.map((t: any) => t.name)

      expect(toolNames).toContain('loopwork_list_tasks')
      expect(toolNames).toContain('loopwork_get_task')
      expect(toolNames).toContain('loopwork_mark_complete')
      expect(toolNames).toContain('loopwork_mark_failed')
      expect(toolNames).toContain('loopwork_mark_in_progress')
      expect(toolNames).toContain('loopwork_reset_task')
      expect(toolNames).toContain('loopwork_get_subtasks')
      expect(toolNames).toContain('loopwork_get_dependencies')
      expect(toolNames).toContain('loopwork_check_dependencies')
      expect(toolNames).toContain('loopwork_count_pending')
      expect(toolNames).toContain('loopwork_backend_status')
    })

    test('tool definitions have required fields', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 3,
        method: 'tools/list',
      }

      // @ts-ignore - Accessing private method for testing
      const response = await server.handleRequest(request)
      const tools = (response.result as any).tools

      tools.forEach((tool: any) => {
        expect(tool).toHaveProperty('name')
        expect(tool).toHaveProperty('description')
        expect(tool).toHaveProperty('inputSchema')
        expect(tool.inputSchema).toHaveProperty('type', 'object')
        expect(tool.inputSchema).toHaveProperty('properties')
      })
    })
  })

  describe('MCP Protocol - Tool Calls', () => {
    test('loopwork_list_tasks - lists all pending tasks', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 4,
        method: 'tools/call',
        params: {
          name: 'loopwork_list_tasks',
          arguments: {},
        },
      }

      // @ts-ignore - Accessing private method for testing
      const response = await server.handleRequest(request)

      expect(response.jsonrpc).toBe('2.0')
      expect(response.id).toBe(4)
      expect(response.result).toBeDefined()

      const content = JSON.parse((response.result as any).content[0].text)
      expect(content.count).toBeGreaterThanOrEqual(2)
      expect(content.tasks).toBeArray()
      expect(content.tasks[0]).toHaveProperty('id')
      expect(content.tasks[0]).toHaveProperty('title')
      expect(content.tasks[0]).toHaveProperty('status')
      expect(content.tasks[0]).toHaveProperty('priority')
    })

    test('loopwork_list_tasks - filters by feature', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 5,
        method: 'tools/call',
        params: {
          name: 'loopwork_list_tasks',
          arguments: { feature: 'auth' },
        },
      }

      // @ts-ignore - Accessing private method for testing
      const response = await server.handleRequest(request)
      const content = JSON.parse((response.result as any).content[0].text)

      expect(content.tasks.every((t: any) => t.feature === 'auth')).toBe(true)
    })

    test('loopwork_list_tasks - filters by priority', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 6,
        method: 'tools/call',
        params: {
          name: 'loopwork_list_tasks',
          arguments: { priority: 'high' },
        },
      }

      // @ts-ignore - Accessing private method for testing
      const response = await server.handleRequest(request)
      const content = JSON.parse((response.result as any).content[0].text)

      expect(content.tasks.every((t: any) => t.priority === 'high')).toBe(true)
    })

    test('loopwork_list_tasks - topLevelOnly excludes sub-tasks', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 7,
        method: 'tools/call',
        params: {
          name: 'loopwork_list_tasks',
          arguments: { topLevelOnly: 'true' },
        },
      }

      // @ts-ignore - Accessing private method for testing
      const response = await server.handleRequest(request)
      const content = JSON.parse((response.result as any).content[0].text)

      expect(content.tasks.every((t: any) => !t.parentId)).toBe(true)
    })

    test('loopwork_get_task - retrieves specific task', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 8,
        method: 'tools/call',
        params: {
          name: 'loopwork_get_task',
          arguments: { taskId: 'TASK-001' },
        },
      }

      // @ts-ignore - Accessing private method for testing
      const response = await server.handleRequest(request)
      const content = JSON.parse((response.result as any).content[0].text)

      expect(content.id).toBe('TASK-001')
      expect(content.title).toBe('Implement authentication')
      expect(content.description).toBe('Add user authentication with JWT')
      expect(content.status).toBe('pending')
      expect(content.priority).toBe('high')
    })

    test('loopwork_get_task - returns error for non-existent task', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 9,
        method: 'tools/call',
        params: {
          name: 'loopwork_get_task',
          arguments: { taskId: 'TASK-999' },
        },
      }

      // @ts-ignore - Accessing private method for testing
      const response = await server.handleRequest(request)
      const content = JSON.parse((response.result as any).content[0].text)

      expect(content.error).toContain('Task not found')
    })

    test('loopwork_mark_complete - marks task as completed', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 10,
        method: 'tools/call',
        params: {
          name: 'loopwork_mark_complete',
          arguments: { taskId: 'TASK-001', comment: 'All tests pass' },
        },
      }

      // @ts-ignore - Accessing private method for testing
      const response = await server.handleRequest(request)
      const content = JSON.parse((response.result as any).content[0].text)

      expect(content.success).toBe(true)

      // Verify task status changed
      const task = await mockBackend.getTask('TASK-001')
      expect(task?.status).toBe('completed')
    })

    test('loopwork_mark_failed - marks task as failed', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 11,
        method: 'tools/call',
        params: {
          name: 'loopwork_mark_failed',
          arguments: { taskId: 'TASK-001', error: 'Build failed' },
        },
      }

      // @ts-ignore - Accessing private method for testing
      const response = await server.handleRequest(request)
      const content = JSON.parse((response.result as any).content[0].text)

      expect(content.success).toBe(true)

      // Verify task status changed
      const task = await mockBackend.getTask('TASK-001')
      expect(task?.status).toBe('failed')
    })

    test('loopwork_mark_in_progress - marks task as in-progress', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 12,
        method: 'tools/call',
        params: {
          name: 'loopwork_mark_in_progress',
          arguments: { taskId: 'TASK-001' },
        },
      }

      // @ts-ignore - Accessing private method for testing
      const response = await server.handleRequest(request)
      const content = JSON.parse((response.result as any).content[0].text)

      expect(content.success).toBe(true)

      // Verify task status changed
      const task = await mockBackend.getTask('TASK-001')
      expect(task?.status).toBe('in-progress')
    })

    test('loopwork_reset_task - resets task to pending', async () => {
      // First mark as completed
      await mockBackend.markCompleted('TASK-001')

      const request = {
        jsonrpc: '2.0' as const,
        id: 13,
        method: 'tools/call',
        params: {
          name: 'loopwork_reset_task',
          arguments: { taskId: 'TASK-001' },
        },
      }

      // @ts-ignore - Accessing private method for testing
      const response = await server.handleRequest(request)
      const content = JSON.parse((response.result as any).content[0].text)

      expect(content.success).toBe(true)

      // Verify task status changed
      const task = await mockBackend.getTask('TASK-001')
      expect(task?.status).toBe('pending')
    })

    test('loopwork_get_subtasks - retrieves sub-tasks', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 14,
        method: 'tools/call',
        params: {
          name: 'loopwork_get_subtasks',
          arguments: { taskId: 'TASK-001' },
        },
      }

      // @ts-ignore - Accessing private method for testing
      const response = await server.handleRequest(request)
      const content = JSON.parse((response.result as any).content[0].text)

      expect(content.parentId).toBe('TASK-001')
      expect(content.count).toBe(1)
      expect(content.subtasks).toBeArray()
      expect(content.subtasks[0].id).toBe('TASK-001a')
      expect(content.subtasks[0].parentId).toBe('TASK-001')
    })

    test('loopwork_get_dependencies - retrieves task dependencies', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 15,
        method: 'tools/call',
        params: {
          name: 'loopwork_get_dependencies',
          arguments: { taskId: 'TASK-003' },
        },
      }

      // @ts-ignore - Accessing private method for testing
      const response = await server.handleRequest(request)
      const content = JSON.parse((response.result as any).content[0].text)

      expect(content.taskId).toBe('TASK-003')
      expect(content.count).toBe(1)
      expect(content.dependencies).toBeArray()
      expect(content.dependencies[0].id).toBe('TASK-001')
    })

    test('loopwork_check_dependencies - checks if dependencies are met', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 16,
        method: 'tools/call',
        params: {
          name: 'loopwork_check_dependencies',
          arguments: { taskId: 'TASK-003' },
        },
      }

      // @ts-ignore - Accessing private method for testing
      const response = await server.handleRequest(request)
      const content = JSON.parse((response.result as any).content[0].text)

      expect(content.taskId).toBe('TASK-003')
      expect(content.dependenciesMet).toBe(false) // TASK-001 is pending
      expect(content.canStart).toBe(false)
    })

    test('loopwork_check_dependencies - returns true when dependencies met', async () => {
      // Mark dependency as completed
      await mockBackend.markCompleted('TASK-001')

      const request = {
        jsonrpc: '2.0' as const,
        id: 17,
        method: 'tools/call',
        params: {
          name: 'loopwork_check_dependencies',
          arguments: { taskId: 'TASK-003' },
        },
      }

      // @ts-ignore - Accessing private method for testing
      const response = await server.handleRequest(request)
      const content = JSON.parse((response.result as any).content[0].text)

      expect(content.dependenciesMet).toBe(true)
      expect(content.canStart).toBe(true)
    })

    test('loopwork_count_pending - counts pending tasks', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 18,
        method: 'tools/call',
        params: {
          name: 'loopwork_count_pending',
          arguments: {},
        },
      }

      // @ts-ignore - Accessing private method for testing
      const response = await server.handleRequest(request)
      const content = JSON.parse((response.result as any).content[0].text)

      // Count may vary due to state changes in previous tests, but should be at least 1
      expect(content.count).toBeGreaterThanOrEqual(1)
    })

    test('loopwork_count_pending - counts with feature filter', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 19,
        method: 'tools/call',
        params: {
          name: 'loopwork_count_pending',
          arguments: { feature: 'auth' },
        },
      }

      // @ts-ignore - Accessing private method for testing
      const response = await server.handleRequest(request)
      const content = JSON.parse((response.result as any).content[0].text)

      expect(content.count).toBe(2) // TASK-001 and TASK-001a
    })

    test('loopwork_backend_status - checks backend health', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 20,
        method: 'tools/call',
        params: {
          name: 'loopwork_backend_status',
          arguments: {},
        },
      }

      // @ts-ignore - Accessing private method for testing
      const response = await server.handleRequest(request)
      const content = JSON.parse((response.result as any).content[0].text)

      expect(content.backend).toBe('mock-backend')
      expect(content.healthy).toBe(true)
      expect(content.latencyMs).toBe(5)
      // Count may vary due to state changes in previous tests, but should be at least 1
      expect(content.pendingTasks).toBeGreaterThanOrEqual(1)
    })
  })

  describe('Error Handling', () => {
    test('handles unknown tool name', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 21,
        method: 'tools/call',
        params: {
          name: 'loopwork_invalid_tool',
          arguments: {},
        },
      }

      // @ts-ignore - Accessing private method for testing
      const response = await server.handleRequest(request)

      expect(response.jsonrpc).toBe('2.0')
      expect(response.id).toBe(21)
      expect(response.error).toBeDefined()
      expect(response.error?.code).toBe(-32000)
      expect(response.error?.message).toContain('Unknown tool')
    })

    test('handles unknown method', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 22,
        method: 'unknown_method',
      }

      // @ts-ignore - Accessing private method for testing
      const response = await server.handleRequest(request)

      expect(response.jsonrpc).toBe('2.0')
      expect(response.id).toBe(22)
      expect(response.error).toBeDefined()
      expect(response.error?.code).toBe(-32601)
      expect(response.error?.message).toContain('Method not found')
    })

    test('handles notifications/initialized', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 23,
        method: 'notifications/initialized',
      }

      // @ts-ignore - Accessing private method for testing
      const response = await server.handleRequest(request)

      expect(response.jsonrpc).toBe('2.0')
      expect(response.id).toBe(23)
      expect(response.result).toBeDefined()
    })

    test('handles backend errors gracefully', async () => {
      // Mock backend to throw error
      const originalGetTask = mockBackend.getTask
      mockBackend.getTask = async () => {
        throw new Error('Database connection failed')
      }

      const request = {
        jsonrpc: '2.0' as const,
        id: 24,
        method: 'tools/call',
        params: {
          name: 'loopwork_get_task',
          arguments: { taskId: 'TASK-001' },
        },
      }

      // @ts-ignore - Accessing private method for testing
      const response = await server.handleRequest(request)

      expect(response.error).toBeDefined()
      expect(response.error?.code).toBe(-32000)
      expect(response.error?.message).toContain('Database connection failed')

      // Restore mock
      mockBackend.getTask = originalGetTask
    })
  })

  describe('Server Initialization', () => {
    test('creates server with default JSON backend', () => {
      // This test verifies the constructor works
      // We can't test the actual backend creation without mocking the module
      const testServer = new LoopworkMcpServer()
      expect(testServer).toBeDefined()
    })

    test('reads backend type from environment', () => {
      const originalEnv = process.env.LOOPWORK_BACKEND
      process.env.LOOPWORK_BACKEND = 'json'

      const testServer = new LoopworkMcpServer()
      expect(testServer).toBeDefined()

      // Restore
      if (originalEnv) {
        process.env.LOOPWORK_BACKEND = originalEnv
      } else {
        delete process.env.LOOPWORK_BACKEND
      }
    })
  })
})
