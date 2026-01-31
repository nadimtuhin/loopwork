/**
 * Capability Registry Implementation
 *
 * Manages CLI commands and AI skills provided by plugins
 */

import type {
  CapabilityRegistry,
  PluginCapabilities,
  CliCommand,
  AiSkill,
} from '../contracts/capability'

class CapabilityRegistryImpl implements CapabilityRegistry {
  private capabilities = new Map<string, PluginCapabilities>()

  register(pluginName: string, capabilities: PluginCapabilities): void {
    this.capabilities.set(pluginName, capabilities)
  }

  getPromptInjection(): string {
    const injections: string[] = []

    for (const [pluginName, caps] of this.capabilities) {
      // Add plugin-level prompt injection
      if (caps.promptInjection) {
        injections.push(`## ${pluginName}\n${caps.promptInjection}`)
      }

      // Add skill-level prompt injections
      if (caps.skills) {
        for (const skill of caps.skills) {
          if (skill.promptInjection) {
            injections.push(`### ${pluginName}:${skill.name}\n${skill.promptInjection}`)
          }
        }
      }
    }

    return injections.length > 0 ? injections.join('\n\n') : ''
  }

  getCommands(): CliCommand[] {
    const commands: CliCommand[] = []
    for (const caps of this.capabilities.values()) {
      if (caps.commands) {
        commands.push(...caps.commands)
      }
    }
    return commands
  }

  getSkills(): AiSkill[] {
    const skills: AiSkill[] = []
    for (const caps of this.capabilities.values()) {
      if (caps.skills) {
        skills.push(...caps.skills)
      }
    }
    return skills
  }

  getPluginCapabilities(pluginName: string): PluginCapabilities | undefined {
    return this.capabilities.get(pluginName)
  }
}

/**
 * Create a new capability registry
 */
export function createCapabilityRegistry(): CapabilityRegistry {
  return new CapabilityRegistryImpl()
}
