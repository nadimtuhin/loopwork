/**
 * Loopwork Contracts
 *
 * Pure types and interfaces - no implementations
 */

// Task types
export type { Task, TaskStatus, Priority, TaskResult, GitHubLabel, GitHubIssue } from './task'
export { LABELS, STATUS_LABELS, PRIORITY_LABELS } from './task'

// Analysis types
export type { TaskAnalysisResult, SuggestedTask, TaskAnalyzer } from './analysis'

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
  ParallelFailureMode,
  OrphanWatchConfig,
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

// Spawner types
export type {
  SpawnedProcess,
  SpawnOptions,
  ProcessSpawner,
} from './spawner'

// Process manager types
export type {
  ProcessMetadata,
  ProcessInfo,
  OrphanInfo,
  CleanupResult,
  IProcessManager,
} from './process-manager'

// Output types
export type {
  OutputFormat,
  JsonEvent,
  RunJsonOutput,
  StatusJsonOutput,
  LogsJsonOutput,
  KillJsonOutput,
  DecomposeJsonOutput,
} from './output'
