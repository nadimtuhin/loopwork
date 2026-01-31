import type { LoopworkPlugin, LoopworkConfig } from '@loopwork-ai/loopwork/contracts'
import { z } from 'zod'
import { McpConnectionManager } from './client/ConnectionManager'
import { McpToolRegistry } from './client/ToolRegistry'
import { logger } from '@loopwork-ai/loopwork'

export const McpStdioTransportSchema = z.object({
  type: z.literal('stdio'),
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
})

export const McpSseTransportSchema = z.object({
  type: z.literal('sse'),
  url: z.string().url(),
})

export const McpServerSchema = z.discriminatedUnion('type', [
  McpStdioTransportSchema,
  McpSseTransportSchema,
])

export const McpScriptSchema = z.object({
  source: z.string(),
  runtime: z.enum(['node', 'bun', 'python', 'bash']).optional(),
  env: z.record(z.string()).optional(),
})

export const McpConfigSchema = z.object({
  servers: z.record(z.string(), McpServerSchema).optional(),
  scripts: z.record(z.string(), McpScriptSchema).optional(),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).optional(),
})

export type McpStdioTransport = z.infer<typeof McpStdioTransportSchema>
export type McpSseTransport = z.infer<typeof McpSseTransportSchema>
export type McpServer = z.infer<typeof McpServerSchema>
export type McpScript = z.infer<typeof McpScriptSchema>
export type McpConfig = z.infer<typeof McpConfigSchema>

export interface McpPluginOptions extends McpConfig {}

export function createMcpPlugin(options: McpPluginOptions = {}): LoopworkPlugin {
  let connectionManager: McpConnectionManager
  let toolRegistry: McpToolRegistry

  return {
    name: 'mcp-manager',
    classification: 'enhancement',

    async onConfigLoad(config: LoopworkConfig) {
      try {
        McpConfigSchema.parse(options)
      } catch (error) {
        logger.warn(`Invalid MCP configuration: ${error}`)
      }

      return config
    },

    async onLoopStart(_namespace: string) {
      logger.info('Initializing MCP Manager...')
      connectionManager = new McpConnectionManager(options)
      toolRegistry = new McpToolRegistry(connectionManager)

      await connectionManager.connectAll()
      await toolRegistry.discoverTools()

      if (options.scripts && Object.keys(options.scripts).length > 0) {
        const { LocalScriptBridgeAdapter } = await import('./adapters/LocalScriptBridgeAdapter')
        const scriptAdapter = new LocalScriptBridgeAdapter(options.scripts)
        scriptAdapter.registerTools(toolRegistry)
      }

      const tools = toolRegistry.getAllTools()
      logger.info(`MCP Manager initialized with ${tools.length} tools`)
    },

    async onLoopEnd() {
      if (connectionManager) {
        await connectionManager.disconnectAll()
      }
    }
  }
}


export function withMCP(options: McpPluginOptions) {
  return (config: LoopworkConfig): LoopworkConfig => {
    const currentMcp = (config['mcp'] as McpConfig) || {}
    const mcpConfig: McpConfig = {
      ...currentMcp,
      ...options
    }

    const plugins = [...(config.plugins || []), createMcpPlugin(options)]

    return {
      ...config,
      plugins,
      mcp: mcpConfig,
    }
  }
}

// Export MCP tools
export {
  spawnSubagent,
  spawnSubagentTool,
  SpawnSubagentInputSchema,
  type SpawnSubagentInput,
  type SpawnSubagentOutput,
  type SpawnSubagentDeps,
} from './tools/spawn-subagent'

export {
  resumeAgent,
  resumeAgentTool,
  ResumeAgentInputSchema,
  type ResumeAgentInput,
  type ResumeAgentOutput,
  type ResumeAgentDeps,
} from './tools/resume-agent'

export { McpConnectionManager, type McpConnection } from './client/ConnectionManager'
export { McpToolRegistry, type McpTool } from './client/ToolRegistry'
export { LocalScriptBridgeAdapter } from './adapters/LocalScriptBridgeAdapter'
