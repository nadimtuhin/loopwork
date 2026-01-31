/**
 * Agent Factory Implementation
 *
 * Creates and validates AgentDefinition objects.
 */

import type {
  AgentDefinition,
  AgentDefinitionInput,
  IAgentFactory,
  ValidationResult,
} from '../contracts/agent'

export class AgentFactory implements IAgentFactory {
  /**
   * Create a frozen AgentDefinition from input
   */
  create(config: AgentDefinitionInput): AgentDefinition {
    const agent: AgentDefinition = {
      name: config.name,
      description: config.description,
      prompt: config.prompt,
      ...(config.tools && { tools: Object.freeze([...config.tools]) }),
      ...(config.model && { model: config.model }),
      ...(config.env && { env: Object.freeze({ ...config.env }) }),
      ...(config.timeout !== undefined && { timeout: config.timeout }),
    }

    return Object.freeze(agent)
  }

  /**
   * Validate an agent definition
   */
  validate(agent: AgentDefinition): ValidationResult {
    const errors: string[] = []

    if (!agent.name || agent.name.trim() === '') {
      errors.push('Agent name is required')
    }

    if (!agent.prompt || agent.prompt.trim() === '') {
      errors.push('Agent prompt is required')
    }

    if (agent.timeout !== undefined && agent.timeout <= 0) {
      errors.push('Timeout must be a positive number')
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }
}
