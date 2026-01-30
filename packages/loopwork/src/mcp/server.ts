#!/usr/bin/env bun
/**
 * MCP (Model Context Protocol) Server for Loopwork
 *
 * Exposes task management functionality via MCP, allowing AI tools
 * like Claude to interact with the task system.
 *
 * Setup for Claude Desktop:
 * Add to ~/Library/Application Support/Claude/claude_desktop_config.json:
 * {
 *   "mcpServers": {
 *     "loopwork-tasks": {
 *       "command": "bun",
 *       "args": ["run", "/path/to/loopwork/src/mcp-server.ts"],
 *       "env": {
 *         "LOOPWORK_BACKEND": "json",
 *         "LOOPWORK_TASKS_FILE": ".specs/tasks/tasks.json"
 *       }
 *     }
 *   }
 * }
 */

import { createBackend, type TaskBackend, type Task } from '../backends'
import type { BackendConfig, FindTaskOptions } from '../backends/types'
import { logger } from '../core/utils'

// MCP Protocol Types
interface McpRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: Record<string, unknown>
}

interface McpResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

interface ToolDefinition {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, { type: string; description: string; enum?: string[] }>
    required?: string[]
  }
}

// MCP Server
class LoopworkMcpServer {
  private backend: TaskBackend

  constructor(backend?: TaskBackend) {
    if (backend) {
      this.backend = backend
    } else {
      const backendType = (process.env.LOOPWORK_BACKEND || 'json') as 'github' | 'json'
      const config: BackendConfig = {
        type: backendType,
        tasksFile: process.env.LOOPWORK_TASKS_FILE || '.specs/tasks/tasks.json',
        repo: process.env.LOOPWORK_REPO,
      }
      this.backend = createBackend(config)
    }
  }

  private getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'loopwork_list_tasks',
        description: 'List all pending tasks from the Loopwork task system. Returns task IDs, titles, priorities, and status.',
        inputSchema: {
          type: 'object',
          properties: {
            feature: { type: 'string', description: 'Filter by feature name' },
            priority: { type: 'string', description: 'Filter by priority', enum: ['high', 'medium', 'low'] },
            includeBlocked: { type: 'string', description: 'Include blocked tasks (true/false)' },
            topLevelOnly: { type: 'string', description: 'Only top-level tasks, no sub-tasks (true/false)' },
          },
        },
      },
      {
        name: 'loopwork_get_task',
        description: 'Get detailed information about a specific task including its full description/PRD.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'The task ID to retrieve' },
          },
          required: ['taskId'],
        },
      },
      {
        name: 'loopwork_mark_complete',
        description: 'Mark a task as completed. Use after successfully implementing a task.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'The task ID to mark complete' },
            comment: { type: 'string', description: 'Optional completion comment' },
          },
          required: ['taskId'],
        },
      },
      {
        name: 'loopwork_mark_failed',
        description: 'Mark a task as failed with an error message.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'The task ID to mark failed' },
            error: { type: 'string', description: 'Error message explaining why it failed' },
          },
          required: ['taskId', 'error'],
        },
      },
      {
        name: 'loopwork_mark_in_progress',
        description: 'Mark a task as in-progress. Use when starting work on a task.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'The task ID to mark in progress' },
          },
          required: ['taskId'],
        },
      },
      {
        name: 'loopwork_reset_task',
        description: 'Reset a task back to pending status for retry.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'The task ID to reset' },
          },
          required: ['taskId'],
        },
      },
      {
        name: 'loopwork_get_subtasks',
        description: 'Get all sub-tasks of a parent task.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'The parent task ID' },
          },
          required: ['taskId'],
        },
      },
      {
        name: 'loopwork_get_dependencies',
        description: 'Get tasks that a task depends on.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'The task ID' },
          },
          required: ['taskId'],
        },
      },
      {
        name: 'loopwork_check_dependencies',
        description: 'Check if all dependencies of a task are met (completed).',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'The task ID' },
          },
          required: ['taskId'],
        },
      },
      {
        name: 'loopwork_count_pending',
        description: 'Count the number of pending tasks.',
        inputSchema: {
          type: 'object',
          properties: {
            feature: { type: 'string', description: 'Filter by feature name' },
          },
        },
      },
      {
        name: 'loopwork_backend_status',
        description: 'Check the health and status of the task backend.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ]
  }

  private formatTask(task: Task): Record<string, unknown> {
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      feature: task.feature,
      parentId: task.parentId,
      dependsOn: task.dependsOn,
    }
  }

  private formatTaskList(tasks: Task[]): Record<string, unknown>[] {
    return tasks.map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      feature: t.feature,
      parentId: t.parentId,
      hasDependencies: (t.dependsOn?.length || 0) > 0,
    }))
  }

  async handleToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'loopwork_list_tasks': {
        const options: FindTaskOptions = {}
        if (args.feature) options.feature = String(args.feature)
        if (args.priority) options.priority = args.priority as 'high' | 'medium' | 'low'
        if (args.includeBlocked === 'true') options.includeBlocked = true
        if (args.topLevelOnly === 'true') options.topLevelOnly = true

        const tasks = await this.backend.listPendingTasks(options)
        return {
          count: tasks.length,
          tasks: this.formatTaskList(tasks),
        }
      }

      case 'loopwork_get_task': {
        const task = await this.backend.getTask(String(args.taskId))
        if (!task) {
          return { error: `Task not found: ${args.taskId}` }
        }
        return this.formatTask(task)
      }

      case 'loopwork_mark_complete': {
        const result = await this.backend.markCompleted(
          String(args.taskId),
          args.comment ? String(args.comment) : undefined
        )
        return result
      }

      case 'loopwork_mark_failed': {
        const result = await this.backend.markFailed(
          String(args.taskId),
          String(args.error)
        )
        return result
      }

      case 'loopwork_mark_in_progress': {
        const result = await this.backend.markInProgress(String(args.taskId))
        return result
      }

      case 'loopwork_reset_task': {
        const result = await this.backend.resetToPending(String(args.taskId))
        return result
      }

      case 'loopwork_get_subtasks': {
        const subtasks = await this.backend.getSubTasks(String(args.taskId))
        return {
          parentId: args.taskId,
          count: subtasks.length,
          subtasks: this.formatTaskList(subtasks),
        }
      }

      case 'loopwork_get_dependencies': {
        const deps = await this.backend.getDependencies(String(args.taskId))
        return {
          taskId: args.taskId,
          count: deps.length,
          dependencies: this.formatTaskList(deps),
        }
      }

      case 'loopwork_check_dependencies': {
        const met = await this.backend.areDependenciesMet(String(args.taskId))
        return {
          taskId: args.taskId,
          dependenciesMet: met,
          canStart: met,
        }
      }

      case 'loopwork_count_pending': {
        const options: FindTaskOptions = {}
        if (args.feature) options.feature = String(args.feature)

        const count = await this.backend.countPending(options)
        return { count }
      }

      case 'loopwork_backend_status': {
        const ping = await this.backend.ping()
        const count = await this.backend.countPending()
        return {
          backend: this.backend.name,
          healthy: ping.ok,
          latencyMs: ping.latencyMs,
          pendingTasks: count,
          error: ping.error,
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  }

  private async handleRequest(request: McpRequest): Promise<McpResponse> {
    const { id, method, params } = request

    try {
      switch (method) {
        case 'initialize':
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: {},
              },
              serverInfo: {
                name: 'loopwork-tasks',
                version: '1.0.0',
              },
            },
          }

        case 'tools/list':
          return {
            jsonrpc: '2.0',
            id,
            result: {
              tools: this.getToolDefinitions(),
            },
          }

        case 'tools/call': {
          const toolName = params?.name as string
          const toolArgs = (params?.arguments || {}) as Record<string, unknown>

          const result = await this.handleToolCall(toolName, toolArgs)

          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            },
          }
        }

        case 'notifications/initialized':
          // No response needed for notifications
          return { jsonrpc: '2.0', id, result: {} }

        default:
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Method not found: ${method}`,
            },
          }
      }
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : String(e)
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32000,
          message: error,
        },
      }
    }
  }

  async run(): Promise<void> {
    const decoder = new TextDecoder()
    const encoder = new TextEncoder()

    // Read from stdin
    const reader = Bun.stdin.stream().getReader()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value)

      // Process complete JSON-RPC messages
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue

        try {
          const request = JSON.parse(line) as McpRequest
          const response = await this.handleRequest(request)

          // Write response to stdout
          const output = JSON.stringify(response) + '\n'
          await Bun.write(Bun.stdout, encoder.encode(output))
        } catch (e: unknown) {
          const error = e instanceof Error ? e.message : String(e)
          const errorResponse: McpResponse = {
            jsonrpc: '2.0',
            id: 0,
            error: {
              code: -32700,
              message: `Parse error: ${error}`,
            },
          }
          await Bun.write(Bun.stdout, encoder.encode(JSON.stringify(errorResponse) + '\n'))
        }
      }
    }
  }
}

// Run server
if (import.meta.main) {
  const server = new LoopworkMcpServer()
  server.run().catch(err => {
    logger.error(err instanceof Error ? err.message : String(err))
  })
}

export { LoopworkMcpServer }
