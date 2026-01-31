/**
 * Factory function for creating AgentExecutor instances
 */

import { AgentExecutor } from '../core/agent-executor'
import { AgentPromptBuilder } from '../core/prompt-builder'
import type { IAgentExecutor, IIdGenerator, IPromptBuilder } from '../contracts/executor'
import type { ICliInvokerRegistry } from '../contracts/invoker'

export interface CreateExecutorOptions {
  promptBuilder?: IPromptBuilder
  idGenerator?: IIdGenerator
  invokerRegistry?: ICliInvokerRegistry
}

/**
 * Create a new AgentExecutor instance
 */
export function createExecutor(options?: CreateExecutorOptions): IAgentExecutor {
  return new AgentExecutor(
    options?.promptBuilder ?? new AgentPromptBuilder(),
    options?.idGenerator,
    options?.invokerRegistry
  )
}
