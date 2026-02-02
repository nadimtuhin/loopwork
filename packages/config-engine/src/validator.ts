import { z } from 'zod'

// Backend Configuration
export const JsonBackendSchema = z.object({
  type: z.literal('json'),
  tasksFile: z.string(),
  tasksDir: z.string().optional(),
  flags: z.record(z.boolean()).optional(),
})

export const GithubBackendSchema = z.object({
  type: z.literal('github'),
  repo: z.string(),
  flags: z.record(z.boolean()).optional(),
})

export const FallbackBackendSchema = z.object({
  type: z.literal('fallback'),
  flags: z.record(z.boolean()).optional(),
})

export const LooseBackendSchema = z.object({
  type: z.string(),
  repo: z.string().optional(),
  tasksFile: z.string().optional(),
  tasksDir: z.string().optional(),
  flags: z.record(z.boolean()).optional(),
}).catchall(z.unknown())

export const BackendConfigSchema = z.union([
  JsonBackendSchema,
  GithubBackendSchema,
  FallbackBackendSchema,
  LooseBackendSchema,
])

// CLI Configuration
export const ModelConfigSchema = z.object({
  name: z.string(),
  displayName: z.string().optional(),
  cli: z.enum(['claude', 'opencode', 'gemini']),
  model: z.string(),
  timeout: z.number().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  costWeight: z.number().optional(),
  enabled: z.boolean().optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
  topP: z.number().optional(),
  topK: z.number().optional(),
  stopSequences: z.array(z.string()).optional(),
  capability: z.string().optional(), // ExtendedModelCapabilityLevel
  primaryRole: z.string().optional(), // ModelRoleType
  secondaryRoles: z.array(z.string()).optional(), // ModelRoleType
})

export const RetryConfigSchema = z.object({
  rateLimitWaitMs: z.number().optional(),
  exponentialBackoff: z.boolean().optional(),
  baseDelayMs: z.number().optional(),
  maxDelayMs: z.number().optional(),
  retrySameModel: z.boolean().optional(),
  maxRetriesPerModel: z.number().optional(),
})

export const CliPathConfigSchema = z.object({
  claude: z.string().optional(),
  opencode: z.string().optional(),
  gemini: z.string().optional(),
})

export const CliExecutorConfigSchema = z.object({
  models: z.array(ModelConfigSchema).optional(),
  fallbackModels: z.array(ModelConfigSchema).optional(),
  cliPaths: CliPathConfigSchema.optional(),
  retry: RetryConfigSchema.optional(),
  selectionStrategy: z.enum(['round-robin', 'priority', 'cost-aware', 'capability', 'random']).optional(),
  sigkillDelayMs: z.number().optional(),
  progressIntervalMs: z.number().optional(),
  preferPty: z.boolean().optional(),
})

// Feature Flags & Configs
export const DynamicTasksConfigSchema = z.object({
  enabled: z.boolean().optional(),
  analyzer: z.unknown().optional(), // 'pattern' | 'llm' | unknown
  createSubTasks: z.boolean().optional(),
  maxTasksPerExecution: z.number().optional(),
  autoApprove: z.boolean().optional(),
})

export const DeadletterPolicySchema = z.object({
  enabled: z.boolean().optional(),
  threshold: z.number().optional(),
  retryCooldownMs: z.number().optional(),
  autoRetry: z.boolean().optional(),
  autoRetryDelayMs: z.number().optional(),
})

export const OrphanWatchConfigSchema = z.object({
  enabled: z.boolean().optional(),
  interval: z.number().optional(),
  maxAge: z.number().optional(),
  autoKill: z.boolean().optional(),
  patterns: z.array(z.string()).optional(),
})

export const RetryBudgetSchema = z.object({
  enabled: z.boolean().optional(),
  maxRetries: z.number().optional(),
  windowMs: z.number().optional(),
  persistence: z.boolean().optional(),
})

export const ResourceLimitsSchema = z.object({
  enabled: z.boolean().optional(),
  cpuLimit: z.number().optional(),
  memoryLimitMB: z.number().optional(),
  checkIntervalMs: z.number().optional(),
  gracePeriodMs: z.number().optional(),
})

export const ErrorAnalyzerSchema = z.object({
  provider: z.enum(['claude', 'glm', 'mock']),
  model: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  maxCallsPerSession: z.number().optional(),
  cooldownMs: z.number().optional(),
})

// Main Config Schema
export const LoopworkConfigSchema = z.object({
  backend: BackendConfigSchema,
  cli: z.enum(['claude', 'opencode', 'gemini']).optional(),
  model: z.string().optional(),
  cliConfig: CliExecutorConfigSchema.optional(),
  maxIterations: z.number().optional(),
  timeout: z.number().optional(),
  namespace: z.string().optional(),
  autoConfirm: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  debug: z.boolean().optional(),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'success', 'silent']).optional(),
  outputMode: z.enum(['human', 'ink', 'json', 'silent']).optional(),
  parallel: z.number().optional(),
  parallelFailureMode: z.enum(['continue', 'abort-all']).optional(),
  feature: z.string().optional(),
  defaultPriority: z.number().optional(),
  maxRetries: z.number().optional(),
  circuitBreakerThreshold: z.number().optional(),
  taskDelay: z.number().optional(),
  retryDelay: z.number().optional(),
  maxRetryDelay: z.number().optional(),
  backoffMultiplier: z.number().optional(),
  jitter: z.boolean().optional(),
  retryStrategy: z.enum(['linear', 'exponential']).optional(),
  selfHealingCooldown: z.number().optional(),
  dynamicTasks: DynamicTasksConfigSchema.optional(),
  deadletter: DeadletterPolicySchema.optional(),
  dynamicPlugins: z.array(z.string()).optional(),
  plugins: z.array(z.any()).optional(), // LoopworkPlugin is complex to schema, using any for now
  orphanWatch: OrphanWatchConfigSchema.optional(),
  retryBudget: RetryBudgetSchema.optional(),
  checkpoint: z.any().optional(), // CheckpointConfig
  resourceLimits: ResourceLimitsSchema.optional(),
  errorAnalyzer: ErrorAnalyzerSchema.optional(),
}).catchall(z.unknown())

export type LoopworkConfig = z.infer<typeof LoopworkConfigSchema>

export function validateConfig(config: unknown): LoopworkConfig {
  return LoopworkConfigSchema.parse(config)
}
