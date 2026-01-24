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
} from './config'
export { DEFAULT_CONFIG } from './config'
