/**
 * Command Registry Implementation
 *
 * Provides centralized command registration and management for Loopwork's CLI.
 * Implements ICommandRegistry interface from @loopwork-ai/contracts.
 */

import type {
  ICommand,
  ICommandRegistry,
  CommandRegistryStats,
  RegisterCommandOptions,
} from '@loopwork-ai/contracts'
import { logger } from '../core/utils'

interface RegisteredCommand {
  command: ICommand
  options: Required<RegisterCommandOptions>
}

export class CommandRegistry implements ICommandRegistry {
  private commands: Map<string, RegisteredCommand> = new Map()

  register(command: ICommand, options: RegisterCommandOptions = {}): void {
    const commandName = command.name

    if (this.commands.has(commandName)) {
      logger.warn(`Command '${commandName}' is already registered. Replacing...`)
    }

    this.commands.set(commandName, {
      command,
      options: {
        priority: options.priority ?? 0,
        hidden: options.hidden ?? false,
        category: options.category ?? 'general',
      },
    })

    logger.debug(`Registered command: ${commandName}`)
  }

  unregister(commandName: string): boolean {
    const existed = this.commands.delete(commandName)
    if (existed) {
      logger.debug(`Unregistered command: ${commandName}`)
    }
    return existed
  }

  get(commandName: string): ICommand | undefined {
    const registered = this.commands.get(commandName)
    return registered?.command
  }

  has(commandName: string): boolean {
    return this.commands.has(commandName)
  }

  getAll(): ICommand[] {
    return Array.from(this.commands.values()).map(r => r.command)
  }

  getByCategory(category: string): ICommand[] {
    return Array.from(this.commands.values())
      .filter(r => r.options.category === category)
      .map(r => r.command)
  }

  getVisible(): ICommand[] {
    return Array.from(this.commands.values())
      .filter(r => !r.options.hidden)
      .map(r => r.command)
  }

  getStats(): CommandRegistryStats {
    const commandsByCategory: Record<string, number> = {}

    for (const registered of this.commands.values()) {
      const category = registered.options.category
      commandsByCategory[category] = (commandsByCategory[category] || 0) + 1
    }

    return {
      totalCommands: this.commands.size,
      activeCommands: this.commands.size,
      commandsByCategory,
    }
  }

  list(): Array<{
    name: string
    description: string
    usage?: string
    examples?: Array<{
      command: string
      description: string
    }>
  }> {
    return Array.from(this.commands.values())
      .filter(r => !r.options.hidden)
      .map(r => ({
        name: r.command.name,
        description: r.command.description,
        usage: r.command.usage,
        examples: r.command.examples,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }
}

// Singleton instance
let registryInstance: CommandRegistry | null = null

export function getCommandRegistry(): CommandRegistry {
  if (!registryInstance) {
    registryInstance = new CommandRegistry()
  }
  return registryInstance
}

export function resetCommandRegistry(): void {
  registryInstance = null
}
