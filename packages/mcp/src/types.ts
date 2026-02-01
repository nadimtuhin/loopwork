import { z } from 'zod'

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
