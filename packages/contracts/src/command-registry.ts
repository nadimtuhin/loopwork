import type { ICommand, RegisterCommandOptions, CommandRegistryStats } from './command'

/**
 * Command Registry Interface
 */

export interface ICommandRegistry {
  register(command: ICommand, options?: RegisterCommandOptions): void
  unregister(commandName: string): boolean
  get(commandName: string): ICommand | undefined
  has(commandName: string): boolean
  getAll(): ICommand[]
  getByCategory(category: string): ICommand[]
  getVisible(): ICommand[]
  getStats(): CommandRegistryStats
  list(): Array<{
    name: string
    description: string
    usage?: string
    examples?: Array<{
      command: string
      description: string
    }>
  }>
}
