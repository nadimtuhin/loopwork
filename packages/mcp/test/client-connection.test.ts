import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { McpConnectionManager } from '../src/client/ConnectionManager'
import { McpToolRegistry } from '../src/client/ToolRegistry'
import type { McpConfig } from '../src/index'

mock.module('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class {
    connect = mock(async () => {})
    close = mock(async () => {})
    listTools = mock(async () => ({ tools: [{ name: 'test-tool', description: 'A test tool', inputSchema: {} }] }))
    callTool = mock(async () => ({ content: [{ type: 'text', text: 'result' }] }))
  }
}))

mock.module('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: class {}
}))

mock.module('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: class {}
}))

describe('McpConnectionManager', () => {
  let config: McpConfig

  beforeEach(() => {
    config = {
      servers: {
        'test-server': {
          type: 'stdio',
          command: 'echo',
          args: ['hello'],
        }
      }
    }
  })

  test('connects to configured servers', async () => {
    const manager = new McpConnectionManager(config)
    await manager.connectAll()
    
    const conn = manager.getConnection('test-server')
    expect(conn).toBeDefined()
    expect(conn?.status).toBe('connected')
  })

  test('disconnects from servers', async () => {
    const manager = new McpConnectionManager(config)
    await manager.connectAll()
    await manager.disconnectAll()
    
    const conn = manager.getConnection('test-server')
    expect(conn?.status).toBe('disconnected')
  })
})

describe('McpToolRegistry', () => {
  let connectionManager: McpConnectionManager
  let config: McpConfig

  beforeEach(async () => {
    config = {
      servers: {
        'test-server': {
          type: 'stdio',
          command: 'echo',
        }
      }
    }
    connectionManager = new McpConnectionManager(config)
    await connectionManager.connectAll()
  })

  test('discovers tools from connected servers', async () => {
    const registry = new McpToolRegistry(connectionManager)
    await registry.discoverTools()
    
    const tools = registry.getAllTools()
    expect(tools.length).toBe(1)
    expect(tools[0].name).toBe('test-tool')
    expect(tools[0].serverName).toBe('test-server')
  })

  test('calls tools through the correct connection', async () => {
    const registry = new McpToolRegistry(connectionManager)
    await registry.discoverTools()
    
    const result = await registry.callTool('test-server:test-tool', { arg: 1 })
    expect(result.content[0].text).toBe('result')
  })

  test('throws error for unknown tools', async () => {
    const registry = new McpToolRegistry(connectionManager)
    await expect(registry.callTool('unknown:tool', {})).rejects.toThrow('Tool not found')
  })
})
