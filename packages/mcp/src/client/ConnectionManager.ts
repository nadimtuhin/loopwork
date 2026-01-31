import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import type { McpConfig, McpServer } from '../index'
import { logger } from '@loopwork-ai/loopwork'

export interface McpConnection {
  name: string
  client: Client
  status: 'connected' | 'disconnected' | 'connecting' | 'error'
  error?: Error
}

export class McpConnectionManager {
  private connections: Map<string, McpConnection> = new Map()
  private config: McpConfig

  constructor(config: McpConfig) {
    this.config = config
  }

  async connectAll(): Promise<void> {
    const servers = this.config.servers || {}
    const connectPromises = Object.entries(servers).map(([name, server]) =>
      this.connect(name, server)
    )
    await Promise.all(connectPromises)
  }

  async connect(name: string, server: McpServer): Promise<void> {
    logger.info(`Connecting to MCP server: ${name}`)
    
    try {
      let transport
      if (server.type === 'stdio') {
        transport = new StdioClientTransport({
          command: server.command,
          args: server.args,
          env: {
            ...process.env,
            ...(server.env || {}),
          } as Record<string, string>,
        })
      } else if (server.type === 'sse') {
        transport = new SSEClientTransport(new URL(server.url))
      } else {
        throw new Error(`Unsupported transport type: ${(server as any).type}`)
      }

      const client = new Client(
        {
          name: 'loopwork-mcp-client',
          version: '1.0.0',
        },
        {
          capabilities: {
            tools: {},
          },
        }
      )

      this.connections.set(name, {
        name,
        client,
        status: 'connecting',
      })

      await client.connect(transport)

      this.connections.set(name, {
        name,
        client,
        status: 'connected',
      })

      logger.info(`Successfully connected to MCP server: ${name}`)
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      logger.error(`Failed to connect to MCP server ${name}: ${err.message}`)
      this.connections.set(name, {
        name,
        client: null as any,
        status: 'error',
        error: err,
      })
    }
  }

  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.connections.values()).map((conn) =>
      this.disconnect(conn.name)
    )
    await Promise.all(disconnectPromises)
  }

  async disconnect(name: string): Promise<void> {
    const conn = this.connections.get(name)
    if (conn && conn.client) {
      try {
        await conn.client.close()
        this.connections.set(name, {
          ...conn,
          status: 'disconnected',
        })
        logger.info(`Disconnected from MCP server: ${name}`)
      } catch (error) {
        logger.error(`Error disconnecting from MCP server ${name}: ${error}`)
      }
    }
  }

  getConnection(name: string): McpConnection | undefined {
    return this.connections.get(name)
  }

  getAllConnections(): McpConnection[] {
    return Array.from(this.connections.values())
  }
}
