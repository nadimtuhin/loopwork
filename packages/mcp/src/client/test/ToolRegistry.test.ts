import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { McpToolRegistry, type McpTool } from '../ToolRegistry'
import { McpConnectionManager } from '../ConnectionManager'

describe('ToolRegistry', () => {
  const connectionManager = new McpConnectionManager({ servers: {} })

  describe('McpToolRegistry', () => {
    test('should instantiate without errors', () => {
      const instance = new McpToolRegistry(connectionManager)
      expect(instance).toBeDefined()
      expect(instance).toBeInstanceOf(McpToolRegistry)
    })

    test('should maintain instance identity', () => {
      const instance1 = new McpToolRegistry(connectionManager)
      const instance2 = new McpToolRegistry(connectionManager)
      expect(instance1).not.toBe(instance2)
    })
  })

  describe('McpTool type', () => {
    test('should be defined as a type', () => {
      const tool: McpTool = {
        name: 'test-tool',
        description: 'Test tool',
        inputSchema: { type: 'object' },
      }
      expect(tool).toBeDefined()
      expect(tool.name).toBe('test-tool')
    })
  })
})
