/**
 * Agent Registry Implementation
 *
 * Map-based registry for managing agent definitions.
 */

import type { AgentDefinition } from '../contracts/agent'
import type { IAgentRegistry } from '../contracts/registry'

export class AgentRegistry implements IAgentRegistry {
  private agents: Map<string, AgentDefinition> = new Map()
  private defaultAgentName: string | undefined

  /**
   * Register an agent definition
   * @throws Error if agent with same name already exists
   */
  register(agent: AgentDefinition): void {
    if (this.agents.has(agent.name)) {
      throw new Error(`Agent "${agent.name}" is already registered`)
    }
    this.agents.set(agent.name, agent)
  }

  /**
   * Get an agent by name
   */
  get(name: string): AgentDefinition | undefined {
    return this.agents.get(name)
  }

  /**
   * Get the default agent
   */
  getDefault(): AgentDefinition | undefined {
    if (!this.defaultAgentName) {
      return undefined
    }
    return this.agents.get(this.defaultAgentName)
  }

  /**
   * List all registered agents
   */
  list(): readonly AgentDefinition[] {
    return Object.freeze([...this.agents.values()])
  }

  /**
   * Set the default agent by name
   * @throws Error if agent not found
   */
  setDefault(name: string): void {
    if (!this.agents.has(name)) {
      throw new Error(`Agent "${name}" not found`)
    }
    this.defaultAgentName = name
  }

  /**
   * Check if an agent exists by name
   */
  has(name: string): boolean {
    return this.agents.has(name)
  }

  /**
   * Unregister an agent by name
   * @returns true if agent was removed, false if not found
   */
  unregister(name: string): boolean {
    if (!this.agents.has(name)) {
      return false
    }

    // Clear default if we're removing the default agent
    if (this.defaultAgentName === name) {
      this.defaultAgentName = undefined
    }

    this.agents.delete(name)
    return true
  }

  /**
   * Clear all registered agents
   */
  clear(): void {
    this.agents.clear()
    this.defaultAgentName = undefined
  }
}
