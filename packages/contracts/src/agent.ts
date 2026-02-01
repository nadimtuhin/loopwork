/**
 * Agent Orchestration Contracts
 *
 * Defines the core interfaces for the agentic system to enable
 * decoupling of agent logic from the orchestration runner.
 */

/**
 * Result of an agent's execution
 */
export interface AgentResponse<TData = any> {
  /** Whether the execution was successful */
  success: boolean

  /** The textual output or response from the agent */
  output: string

  /** Structured data returned by the agent */
  data?: TData

  /** Error details if execution failed */
  error?: {
    code: string
    message: string
    stack?: string
  }
}

/**
 * Interface for tools that agents can use
 *
 * @template TInput - Type of input parameters
 * @template TOutput - Type of execution result
 */
export interface ITool<TInput = any, TOutput = any> {
  /** Unique name of the tool */
  readonly name: string

  /** Description of what the tool does and when to use it */
  readonly description: string

  /** JSON schema for the tool's input parameters (optional) */
  readonly inputSchema?: Record<string, any>

  /**
   * Execute the tool with the given input
   * @param input - The parameters for tool execution
   * @returns The result of tool execution
   */
  execute(input: TInput): Promise<TOutput>
}

/**
 * Core Agent interface
 *
 * Defines the contract for all agents in the system.
 */
export interface IAgent {
  /** Unique identifier for the agent */
  readonly id: string

  /** Display name of the agent */
  readonly name: string

  /** Description of the agent's purpose and capabilities */
  readonly description: string

  /** Tools available to this agent */
  readonly tools: ITool[]

  /**
   * Create a plan to solve the given task
   * @param task - The task description or goal
   * @returns A list of steps or a structured plan
   */
  plan(task: string): Promise<string[]>

  /**
   * Execute the agent's logic for a given task
   * @param task - The task description or goal
   * @param options - Optional execution parameters
   * @returns The result of agent execution
   */
  execute(task: string, options?: Record<string, any>): Promise<AgentResponse>
}

/**
 * Registry for managing and retrieving agents
 */
export interface IAgentRegistry {
  /**
   * Register a new agent in the registry
   * @param agent - The agent instance to register
   */
  register(agent: IAgent): void

  /**
   * Retrieve an agent by its unique ID
   * @param id - The ID of the agent to find
   * @returns The agent instance or undefined if not found
   */
  getAgent(id: string): IAgent | undefined

  /**
   * List all registered agents
   * @returns Array of registered agent instances
   */
  listAgents(): IAgent[]

  /**
   * Unregister an agent by ID
   * @param id - The ID of the agent to remove
   */
  unregister(id: string): void
}
