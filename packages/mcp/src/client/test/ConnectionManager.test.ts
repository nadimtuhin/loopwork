import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { McpConnectionManager, type McpConnection } from '../ConnectionManager'

describe('ConnectionManager', () => {
  describe('McpConnectionManager', () => {
    test('should instantiate without errors', () => {
      const instance = new McpConnectionManager({ servers: {} })
      expect(instance).toBeDefined()
      expect(instance).toBeInstanceOf(McpConnectionManager)
    })

    test('should maintain instance identity', () => {
      const instance1 = new McpConnectionManager({ servers: {} })
      const instance2 = new McpConnectionManager({ servers: {} })
      expect(instance1).not.toBe(instance2)
    })
  })

  describe('McpConnection type', () => {
    test('should be defined as a type', () => {
      const conn: McpConnection = {
        name: 'test',
        client: null as any,
        status: 'disconnected',
      }
      expect(conn).toBeDefined()
      expect(conn.status).toBe('disconnected')
    })
  })
})
