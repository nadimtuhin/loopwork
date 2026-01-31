/**
 * Contract exports for @loopwork-ai/agents
 */

export type {
  AgentDefinition,
  AgentDefinitionInput,
  AgentModel,
  IAgentFactory,
  ValidationResult,
} from './agent'

export type {
  IAgentRegistry,
} from './registry'

export type {
  CliRunOptions,
  CliRunResult,
  ExecutionContext,
  ExecutionResult,
  IAgentExecutor,
  ICliRunner,
  IIdGenerator,
  IPromptBuilder,
} from './executor'

export type {
  CliInvokeOptions,
  CliInvokeResult,
  ICliInvoker,
  ICliInvokerRegistry,
} from './invoker'
