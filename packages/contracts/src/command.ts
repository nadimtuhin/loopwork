/**
 * Command Contracts
 *
 * Defines the foundational interfaces for the CLI command system
 * to enable decoupling from the core runner.
 */

import type { ILogger, LogLevel } from './logger'

/**
 * Result of command execution
 */
export interface CommandResult {
  success: boolean
  code: number
  message: string
  data?: Record<string, unknown>
}

/**
 * Command execution options
 */
export interface CommandOptions {
  [key: string]: unknown
}

/**
 * Core command interface
 *
 * All CLI commands must implement this interface to be registered
 * and executed through the command system.
 */
export interface ICommand {
  /** Unique command identifier */
  readonly name: string

  /** Brief description of what the command does */
  readonly description: string

  /** Usage string shown in help */
  readonly usage?: string

  /** Example usages with descriptions */
  readonly examples?: Array<{
    command: string
    description: string
  }>

  /** Related commands for cross-referencing in help */
  readonly seeAlso?: string[]

  /**
   * Execute the command
   * @param context - Execution context with services
   * @param options - Command-line options
   * @returns Result of execution
   */
  execute(context: CommandContext, options: CommandOptions): Promise<CommandResult>

  /**
   * Validate options before execution
   * @param options - Command-line options to validate
   * @returns Error message if invalid, undefined if valid
   */
  validate?(options: CommandOptions): string | undefined
}

/**
 * Context provided to commands during execution
 *
 * Contains all necessary services like logger, filesystem access,
 * and configuration for the command to function.
 */
export interface CommandContext {
  /** Logger instance for command output */
  logger: ILogger

  /** Filesystem utilities */
  fs: FileSystem

  /** Path manipulation utilities */
  path: Path

  /** Process-related utilities */
  process: ProcessUtils

  /** Additional dependencies available to commands */
  deps?: Record<string, unknown>
}

/**
 * Filesystem utilities interface
 */
export interface FileSystem {
  existsSync(path: string): boolean
  readFileSync(path: string, encoding?: string): string
  writeFileSync(path: string, content: string): void
  readdirSync(path: string): string[]
  mkdirSync(path: string, options?: { recursive?: boolean }): void
}

/**
 * Path manipulation utilities interface
 */
export interface Path {
  join(...paths: string[]): string
  dirname(path: string): string
  basename(path: string): string
  relative(from: string, to: string): string
}

/**
 * Process utilities interface
 */
export interface ProcessUtils {
  cwd(): string
  exit(code: number): void
  env(): Record<string, string>
  isCI(): boolean
  isTTY(): boolean
}

/**
 * Statistics about the command registry
 */
export interface CommandRegistryStats {
  totalCommands: number
  activeCommands: number
  commandsByCategory?: Record<string, number>
}

/**
 * Options for registering a command
 */
export interface RegisterCommandOptions {
  /** Priority for command ordering (higher = shown first) */
  priority?: number

  /** Whether to hide from help listing */
  hidden?: boolean

  /** Category for organizing commands */
  category?: string
}
