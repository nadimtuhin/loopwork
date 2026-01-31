import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { McpConnectionManager } from './ConnectionManager'
import { logger } from '@loopwork-ai/loopwork'

export interface McpTool {
  name: string
  description: string
  inputSchema: any
  serverName?: string
  handler?: (args: any) => Promise<any>
}

export class McpToolRegistry {
  private tools: Map<string, McpTool> = new Map()
  private connectionManager: McpConnectionManager

  constructor(connectionManager: McpConnectionManager) {
    this.connectionManager = connectionManager
  }

  async discoverTools(): Promise<void> {
    const connections = this.connectionManager.getAllConnections()
    
    for (const conn of connections) {
      if (conn.status !== 'connected') continue

      try {
        const response = await conn.client.listTools()
        for (const tool of response.tools) {
          const toolName = `${conn.name}:${tool.name}`
          this.tools.set(toolName, {
            name: tool.name,
            description: tool.description || '',
            inputSchema: tool.inputSchema,
            serverName: conn.name,
          })
          logger.debug(`Registered MCP tool: ${toolName}`)
        }
      } catch (error) {
        logger.error(`Failed to list tools for MCP server ${conn.name}: ${error}`)
      }
    }
  }

  registerLocalTool(tool: McpTool): void {
    const toolName = tool.serverName ? `${tool.serverName}:${tool.name}` : tool.name
    this.tools.set(toolName, tool)
    logger.debug(`Registered local tool: ${toolName}`)
  }

  getTool(toolName: string): McpTool | undefined {
    return this.tools.get(toolName)
  }

  getAllTools(): McpTool[] {
    return Array.from(this.tools.values())
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<any> {
    const tool = this.tools.get(toolName)
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`)
    }

    if (tool.handler) {
      logger.info(`Calling local tool: ${toolName}`)
      return await tool.handler(args)
    }

    if (!tool.serverName) {
      throw new Error(`Tool ${toolName} has no server or handler`)
    }

    const conn = this.connectionManager.getConnection(tool.serverName)
    if (!conn || conn.status !== 'connected') {
      throw new Error(`Server not connected: ${tool.serverName}`)
    }

    try {
      logger.info(`Calling MCP tool: ${toolName}`)
      const response = await conn.client.callTool({
        name: tool.name,
        arguments: args,
      })
      return response
    } catch (error) {
      logger.error(`Error calling MCP tool ${toolName}: ${error}`)
      throw error
    }
  }
}

