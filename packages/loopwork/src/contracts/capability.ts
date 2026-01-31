/**
 * Plugin Capability System
 *
 * Defines types for CLI commands and AI skills that plugins can provide
 */

/**
 * CLI command provided by a plugin
 */
export interface CliCommand {
  name: string
  description: string
  handler: (...args: unknown[]) => void | Promise<void>
}

/**
 * AI skill provided by a plugin (e.g., slash commands for Claude Code)
 */
export interface AiSkill {
  name: string
  description: string
  promptInjection?: string
}

/**
 * Capabilities provided by a plugin
 */
export interface PluginCapabilities {
  commands?: CliCommand[]
  skills?: AiSkill[]
  promptInjection?: string
}

/**
 * Registry for managing plugin capabilities
 */
export interface CapabilityRegistry {
  /**
   * Register capabilities from a plugin
   */
  register(pluginName: string, capabilities: PluginCapabilities): void

  /**
   * Get prompt injection text for all registered capabilities
   */
  getPromptInjection(): string

  /**
   * Get all registered CLI commands
   */
  getCommands(): CliCommand[]

  /**
   * Get all registered AI skills
   */
  getSkills(): AiSkill[]

  /**
   * Get capabilities for a specific plugin
   */
  getPluginCapabilities(pluginName: string): PluginCapabilities | undefined
}
