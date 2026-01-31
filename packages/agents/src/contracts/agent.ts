/**
 * Agent Definition Contract
 *
 * Defines the immutable configuration for an agent.
 */

/** Model types supported by agents */
export type AgentModel = 'sonnet' | 'opus' | 'haiku' | (string & {})

/** Agent definition - immutable configuration for an agent */
export interface AgentDefinition {
  readonly name: string
  readonly description: string
  readonly prompt: string
  readonly tools?: readonly string[]
  readonly model?: AgentModel
  readonly env?: Readonly<Record<string, string>>
  readonly timeout?: number
}

/** Validation result for agent definitions */
export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/** Input type for creating an agent definition */
export type AgentDefinitionInput = Partial<AgentDefinition> &
  Pick<AgentDefinition, 'name' | 'description' | 'prompt'>

/** Factory interface for creating and validating agents */
export interface IAgentFactory {
  /**
   * Create a frozen AgentDefinition from input
   */
  create(config: AgentDefinitionInput): AgentDefinition

  /**
   * Validate an agent definition
   */
  validate(agent: AgentDefinition): ValidationResult
}
