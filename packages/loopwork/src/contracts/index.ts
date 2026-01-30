/**
 * Loopwork Contracts
 *
 * Pure types and interfaces - no implementations
 */

// Task types
export type { Task, TaskStatus, Priority, TaskResult, GitHubLabel, GitHubIssue } from './task'
export { LABELS, STATUS_LABELS, PRIORITY_LABELS } from './task'

// Plugin types
export type {
  LoopworkPlugin,
  PluginTask,
  TaskMetadata,
  PluginContext,
  TaskContext,
  PluginTaskResult,
  LoopStats,
  ConfigWrapper,
} from './plugin'

// Backend types
export type {
  TaskBackend,
  BackendPlugin,
  BackendConfig,
  BackendFactory,
  FindTaskOptions,
  UpdateResult,
  PingResult,
} from './backend'

// Config types
export type {
  LoopworkConfig,
  LogLevel,
} from './config'
export { DEFAULT_CONFIG } from './config'

// CLI types
export type {
  CliType,
  ModelSelectionStrategy,
  ModelConfig,
  RetryConfig,
  CliPathConfig,
  CliExecutorConfig,
} from './cli'
export { DEFAULT_RETRY_CONFIG, DEFAULT_CLI_EXECUTOR_CONFIG } from './cli'

// Executor/state interfaces
export type { ICliExecutor } from './executor'
export type { IStateManager, StateSnapshot, IStateManagerConstructor } from './state'
