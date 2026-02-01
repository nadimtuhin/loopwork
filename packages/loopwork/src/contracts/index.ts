/**
 * Loopwork Contracts
 *
 * Pure types and interfaces - no implementations
 */

// Base types (no dependencies)
export type {
  TaskStatus,
  Priority,
  TaskEventType,
  TaskEvent,
  EventLog,
  TaskTimestamps,
  Task,
  TaskResult,
  FindTaskOptions,
  UpdateResult,
  PingResult,
  ApiQuotaInfo,
  SchedulingMetadata,
  TaskMetadata,
  PluginTask,
  PluginTaskResult,
  LoopStats,
  StepEvent,
  ToolCallEvent,
  AgentResponseEvent,
  CliResultEvent,
  LogLevel,
  OutputMode,
  ParallelFailureMode,
  OrphanWatchConfig,
  FeatureFlags,
  DynamicTasksConfig,
  BackendConfig,
  JsonBackendConfig,
  GithubBackendConfig,
  FallbackBackendConfig,
  LooseBackendConfig,
} from './types'

// Task types
export type { GitHubLabel, GitHubIssue } from './task'
export { LABELS, STATUS_LABELS, PRIORITY_LABELS } from './task'

// Checkpoint types
export type { Checkpoint, CheckpointConfig } from './checkpoint'

// Analysis types
export type { TaskAnalysisResult, SuggestedTask, TaskAnalyzer } from './analysis'
export type {
  ILLMAnalyzer,
  LLMAnalyzerConfig,
  ErrorAnalysisRequest,
  ErrorAnalysisResponse,
  IErrorAnalyzer,
  TaskOutputAnalysisRequest,
  TaskOutputAnalysisResponse,
  ITaskOutputAnalyzer,
  AnyLLMAnalyzer,
  AnyAnalyzerRequest,
  AnyAnalyzerResponse,
  IAnalyzerRegistry,
  AnalyzerFactory,
  ErrorAnalyzerFactoryConfig,
  TaskOutputAnalyzerFactoryConfig,
} from './llm-analyzer'

// Plugin types
export type {
  LoopworkPlugin,
  PluginContext,
  TaskContext,
  ConfigWrapper,
  LoopworkContext,
} from './plugin'

// Capability types
export type {
  CliCommand,
  AiSkill,
  PluginCapabilities,
  CapabilityRegistry,
} from './capability'

// Backend types
export type {
  TaskBackend,
  BackendPlugin,
  BackendFactory,
} from './backend'

// Config types
export type {
  LoopworkConfig,
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

export type { RetryPolicy, RetryPolicies } from '../core/retry'
export { DEFAULT_RETRY_POLICY } from '../core/retry'

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

// Safety types
export type {
  SafetyConfig,
  RiskAssessment,
  ConfirmationRequest,
  ConfirmationResult,
  SafetyCheckContext
} from './safety'
export { RiskLevel, DEFAULT_SAFETY_CONFIG } from './safety'

// Embedding types
export type {
  EmbeddingProvider,
  EmbeddingConfig,
  EmbeddingProviderFactory,
} from './embedding'

// Vector store types
export type {
  VectorStore,
  Document,
  SearchOptions,
  SearchResult,
  VectorStoreConfig,
  VectorStoreFactory,
} from './vector-store'

// Messaging types
export type {
  AgentId,
  MessageRecipient,
  BroadcastTarget,
  Message,
  MessageHandler,
  MessageSubscription,
  MessageFilter,
  MessageBusStats,
  MessageBusOptions,
  IMessageBus,
  AgentMetadata,
} from './messaging'
export { MessageType, BROADCAST_ALL, BROADCAST_MANAGERS, BROADCAST_WORKERS } from './messaging'

// Debugger types
export type {
  DebugEventType,
  DebugEvent,
  PrePromptEvent,
  Breakpoint,
  DebuggerState,
  DebuggerListener,
  TUICommand,
  TUIResult,
  IDebugger,
  IDebuggerTUI,
} from './debugger'

// Model capability types
export type {
  ModelCapabilityLevel,
  ExtendedModelCapabilityLevel,
  ModelRoleType,
  TaskCategory,
  ModelCapability,
  ModelRole,
  CapabilityModelConfig,
  CapabilityCriteria,
  CapabilityMatchResult,
  ModelCapabilityRegistry,
  CapabilityBasedModelSelector,
} from './model-capability'
export {
  DEFAULT_CAPABILITIES,
  DEFAULT_ROLES,
  TASK_CATEGORY_CAPABILITY_MAP,
} from './model-capability'
