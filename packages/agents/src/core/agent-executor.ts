/**
 * Agent Executor Implementation
 *
 * Orchestrates CLI execution with agent configuration.
 */

import type { Task } from '@loopwork-ai/loopwork/contracts'
import type { AgentDefinition } from '../contracts/agent'
import type {
  ExecutionContext,
  ExecutionResult,
  IAgentExecutor,
  IIdGenerator,
  IPromptBuilder,
} from '../contracts/executor'
import type { ICliInvokerRegistry } from '../contracts/invoker'
import { AgentPromptBuilder } from './prompt-builder'

/** Default ID generator using crypto.randomUUID */
const defaultIdGenerator: IIdGenerator = {
  generate: () => crypto.randomUUID(),
}

export class AgentExecutor implements IAgentExecutor {
  private promptBuilder: IPromptBuilder
  private idGenerator: IIdGenerator
  private invokerRegistry: ICliInvokerRegistry | null

  constructor(
    promptBuilder?: IPromptBuilder,
    idGenerator?: IIdGenerator,
    invokerRegistry?: ICliInvokerRegistry | null
  ) {
    this.promptBuilder = promptBuilder ?? new AgentPromptBuilder()
    this.idGenerator = idGenerator ?? defaultIdGenerator
    // Only use invokerRegistry if explicitly provided
    // This preserves backward compatibility with tests using cliRunner
    this.invokerRegistry = invokerRegistry ?? null
  }

  /**
   * Execute an agent with a task
   */
  async execute(
    agent: AgentDefinition,
    task: Task,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const agentId = this.idGenerator.generate()

    // Build prompt from task and agent
    const prompt = this.promptBuilder.build(task, agent, undefined)

    // Merge environment variables (agent overrides context)
    const env = {
      ...context.env,
      ...agent.env,
    }

    // Determine timeout (agent takes precedence)
    const timeout = agent.timeout ?? context.timeout

    // If invokerRegistry was explicitly provided, try to use invokers
    if (this.invokerRegistry) {
      // Find appropriate invoker for the model
      let invoker = agent.model ? this.invokerRegistry.getForModel(agent.model) : undefined

      // Fall back to default invoker
      if (!invoker) {
        invoker = this.invokerRegistry.getDefault()
      }

      // Fall back to first available
      if (!invoker) {
        invoker = await this.invokerRegistry.findAvailable()
      }

      // If we have an invoker, use it directly
      if (invoker) {
        const result = await invoker.invoke({
          prompt,
          workDir: context.workDir,
          model: agent.model,
          timeout,
          env,
          tools: agent.tools,
        })

        return {
          agentId,
          agentName: agent.name,
          taskId: task.id,
          exitCode: result.exitCode,
          output: result.output,
          durationMs: result.durationMs,
          timedOut: result.timedOut,
        }
      }
    }

    // Use CLI runner (default behavior)
    const result = await context.cliRunner.run({
      command: 'claude', // Default CLI command
      args: [],
      prompt,
      workDir: context.workDir,
      env,
      timeout,
      model: agent.model,
    })

    return {
      agentId,
      agentName: agent.name,
      taskId: task.id,
      exitCode: result.exitCode,
      output: result.output,
      durationMs: result.durationMs,
      timedOut: result.timedOut,
    }
  }
}
