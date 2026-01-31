/**
 * Agent Executor Contract
 *
 * Defines the interface for executing agents with tasks.
 */

import type { Task } from '@loopwork-ai/loopwork/contracts'
import type { AgentDefinition } from './agent'

/** CLI runner interface - injected dependency */
export interface ICliRunner {
  run(options: CliRunOptions): Promise<CliRunResult>
}

/** Options for running a CLI command */
export interface CliRunOptions {
  command: string
  args: string[]
  prompt: string
  workDir: string
  env?: Record<string, string>
  timeout?: number
  model?: string
}

/** Result from a CLI run */
export interface CliRunResult {
  exitCode: number
  output: string
  durationMs: number
  timedOut: boolean
}

/** Context for agent execution */
export interface ExecutionContext {
  cliRunner: ICliRunner
  workDir: string
  env?: Record<string, string>
  timeout?: number
}

/** Result from agent execution */
export interface ExecutionResult {
  agentId: string
  agentName: string
  taskId: string
  exitCode: number
  output: string
  durationMs: number
  timedOut: boolean
}

/** Executor interface for running agents */
export interface IAgentExecutor {
  /**
   * Execute an agent with a task
   */
  execute(
    agent: AgentDefinition,
    task: Task,
    context: ExecutionContext
  ): Promise<ExecutionResult>
}

/** Prompt builder interface */
export interface IPromptBuilder {
  /**
   * Build a prompt for task execution
   * @param task The task to build prompt for
   * @param agent Optional agent definition to include instructions from
   * @param retryContext Optional context from previous failed attempts
   */
  build(task: Task, agent?: AgentDefinition, retryContext?: string): string
}

/** ID generator interface for dependency injection */
export interface IIdGenerator {
  generate(): string
}
