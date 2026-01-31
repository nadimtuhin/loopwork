/**
 * Agent Registry Contract
 *
 * Defines the interface for managing agent registrations.
 */

import type { AgentDefinition } from './agent'

/** Registry interface for managing agent definitions */
export interface IAgentRegistry {
  /**
   * Register an agent definition
   * @throws Error if agent with same name already exists
   */
  register(agent: AgentDefinition): void

  /**
   * Get an agent by name
   */
  get(name: string): AgentDefinition | undefined

  /**
   * Get the default agent
   */
  getDefault(): AgentDefinition | undefined

  /**
   * List all registered agents
   */
  list(): readonly AgentDefinition[]

  /**
   * Set the default agent by name
   * @throws Error if agent not found
   */
  setDefault(name: string): void

  /**
   * Check if an agent exists by name
   */
  has(name: string): boolean

  /**
   * Unregister an agent by name
   * @returns true if agent was removed, false if not found
   */
  unregister(name: string): boolean

  /**
   * Clear all registered agents
   */
  clear(): void
}
