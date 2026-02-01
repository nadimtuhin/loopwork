import { describe, expect, test } from 'bun:test'
import {
  type McpPluginOptions,
  McpStdioTransportSchema,
  McpSseTransportSchema,
  McpServerSchema,
  McpScriptSchema,
  McpConfigSchema,
  type McpStdioTransport,
  type McpSseTransport,
  type McpServer,
  type McpScript,
  type McpConfig,
} from '../types'

describe('types', () => {
  describe('McpPluginOptions type', () => {
    test('should be defined', () => {
      const options: McpPluginOptions = {}
      expect(options).toBeDefined()
    })
  })

  describe('McpStdioTransportSchema', () => {
    test('should be defined', () => {
      expect(McpStdioTransportSchema).toBeDefined()
    })
  })

  describe('McpSseTransportSchema', () => {
    test('should be defined', () => {
      expect(McpSseTransportSchema).toBeDefined()
    })
  })

  describe('McpServerSchema', () => {
    test('should be defined', () => {
      expect(McpServerSchema).toBeDefined()
    })
  })

  describe('McpScriptSchema', () => {
    test('should be defined', () => {
      expect(McpScriptSchema).toBeDefined()
    })
  })

  describe('McpConfigSchema', () => {
    test('should be defined', () => {
      expect(McpConfigSchema).toBeDefined()
    })
  })

  describe('McpStdioTransport type', () => {
    test('should be defined', () => {
      const transport: McpStdioTransport = {
        type: 'stdio',
        command: 'test',
      }
      expect(transport).toBeDefined()
    })
  })

  describe('McpSseTransport type', () => {
    test('should be defined', () => {
      const transport: McpSseTransport = {
        type: 'sse',
        url: 'http://localhost',
      }
      expect(transport).toBeDefined()
    })
  })

  describe('McpServer type', () => {
    test('should be defined', () => {
      const server: McpServer = {
        type: 'stdio',
        command: 'test',
      }
      expect(server).toBeDefined()
    })
  })

  describe('McpScript type', () => {
    test('should be defined', () => {
      const script: McpScript = {
        source: 'test',
      }
      expect(script).toBeDefined()
    })
  })

  describe('McpConfig type', () => {
    test('should be defined', () => {
      const config: McpConfig = {}
      expect(config).toBeDefined()
    })
  })
})
