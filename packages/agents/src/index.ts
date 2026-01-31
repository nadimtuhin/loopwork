/**
 * @loopwork-ai/agents
 *
 * Agent management package for the Loopwork framework.
 * Provides agent definitions, registry, and execution capabilities.
 */

// Contracts (types)
export type {
  AgentDefinition,
  AgentDefinitionInput,
  AgentModel,
  IAgentFactory,
  ValidationResult,
} from './contracts/agent'

export type {
  IAgentRegistry,
} from './contracts/registry'

export type {
  CliRunOptions,
  CliRunResult,
  ExecutionContext,
  ExecutionResult,
  IAgentExecutor,
  ICliRunner,
  IIdGenerator,
  IPromptBuilder,
} from './contracts/executor'

export type {
  CliInvokeOptions,
  CliInvokeResult,
  ICliInvoker,
  ICliInvokerRegistry,
} from './contracts/invoker'

// Core implementations
export { AgentFactory } from './core/agent-factory'
export { AgentRegistry } from './core/agent-registry'
export { AgentExecutor } from './core/agent-executor'
export { AgentPromptBuilder } from './core/prompt-builder'

// Invokers
export {
  BaseCliInvoker,
  ClaudeInvoker,
  OpenCodeInvoker,
  DroidInvoker,
  CliInvokerRegistry,
  createInvokerRegistry,
} from './invokers'

// Factory functions
export { createRegistry, createExecutor } from './factories'
export type { CreateExecutorOptions } from './factories'

// Model Config Registry (generic name → model config)
export {
  ModelConfigRegistry,
  ModelPresets,
  getModelConfigRegistry,
  resetModelConfigRegistry,
  getModelString,
  getModelCli,
  getModelConfig,
} from './models'
export type {
  ModelConfig,
  IModelConfigRegistry,
} from './models'
