/**
 * Factory function for creating AgentRegistry instances
 */

import { AgentRegistry } from '../core/agent-registry'
import type { IAgentRegistry } from '../contracts/registry'

/**
 * Create a new AgentRegistry instance
 */
export function createRegistry(): IAgentRegistry {
  return new AgentRegistry()
}
