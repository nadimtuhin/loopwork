export { BaseCliInvoker, parseModelName, stripModelPrefix } from './base-invoker'
export type { ParsedModel } from './base-invoker'
export { ClaudeInvoker } from './claude-invoker'
export { OpenCodeInvoker } from './opencode-invoker'
export { DroidInvoker } from './droid-invoker'
export { CliInvokerRegistry } from './registry'

import { CliInvokerRegistry } from './registry'
import { ClaudeInvoker } from './claude-invoker'
import { OpenCodeInvoker } from './opencode-invoker'
import { DroidInvoker } from './droid-invoker'
import type { ICliInvokerRegistry } from '../contracts/invoker'

/**
 * Create a registry with all built-in invokers
 */
export function createInvokerRegistry(): ICliInvokerRegistry {
  const registry = new CliInvokerRegistry()

  // Register built-in invokers
  registry.register(new ClaudeInvoker())
  registry.register(new OpenCodeInvoker())
  registry.register(new DroidInvoker())

  // Default to Claude
  registry.setDefault('claude')

  return registry
}
