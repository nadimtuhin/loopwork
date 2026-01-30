import { logger } from './utils'
import chalk from 'chalk'

/**
 * Error code registry - maps error codes to documentation URLs
 *
 * Each error code is organized by category for easy reference.
 * When throwing errors, use the appropriate LoopworkError with these codes.
 */
export const ERROR_CODES = {
  /** Lock & File System Errors - Issues with file access, locks, or I/O operations */

  /** Failed to acquire file lock - another process may be using the resource */
  ERR_LOCK_CONFLICT: 'https://docs.loopwork.ai/errors/lock-conflict',

  /** Required file not found at expected path */
  ERR_FILE_NOT_FOUND: 'https://docs.loopwork.ai/errors/file-not-found',

  /** Failed to write to file - check permissions and disk space */
  ERR_FILE_WRITE: 'https://docs.loopwork.ai/errors/file-write',

  /** Failed to read from file - check file exists and has read permissions */
  ERR_FILE_READ: 'https://docs.loopwork.ai/errors/file-read',

  /** Configuration Errors - Issues with configuration files or environment setup */

  /** Configuration file contains invalid data or schema violations */
  ERR_CONFIG_INVALID: 'https://docs.loopwork.ai/errors/config-invalid',

  /** Required configuration file not found */
  ERR_CONFIG_MISSING: 'https://docs.loopwork.ai/errors/config-missing',

  /** Failed to load or parse configuration file */
  ERR_CONFIG_LOAD: 'https://docs.loopwork.ai/errors/config-load',

  /** Environment variable has invalid value or format */
  ERR_ENV_INVALID: 'https://docs.loopwork.ai/errors/env-invalid',

  /** CLI Errors - Issues with CLI tool execution or discovery */

  /** CLI tool not found in PATH or expected locations */
  ERR_CLI_NOT_FOUND: 'https://docs.loopwork.ai/errors/cli-not-found',

  /** CLI tool failed during execution */
  ERR_CLI_EXEC: 'https://docs.loopwork.ai/errors/cli-exec',

  /** CLI tool exceeded timeout and was terminated */
  ERR_CLI_TIMEOUT: 'https://docs.loopwork.ai/errors/cli-timeout',

  /** Backend Errors - Issues with task backend initialization or validation */

  /** Backend configuration is invalid or incompatible */
  ERR_BACKEND_INVALID: 'https://docs.loopwork.ai/errors/backend-invalid',

  /** Failed to initialize backend - check configuration and dependencies */
  ERR_BACKEND_INIT: 'https://docs.loopwork.ai/errors/backend-init',

  /** Task Errors - Issues with task operations or dependencies */

  /** Requested task ID not found in backend */
  ERR_TASK_NOT_FOUND: 'https://docs.loopwork.ai/errors/task-not-found',

  /** Task data is invalid or malformed */
  ERR_TASK_INVALID: 'https://docs.loopwork.ai/errors/task-invalid',

  /** Task dependencies cannot be resolved or are circular */
  ERR_TASK_DEPS: 'https://docs.loopwork.ai/errors/task-deps',

  /** State Errors - Issues with state persistence or validation */

  /** State data has invalid format or missing required fields */
  ERR_STATE_INVALID: 'https://docs.loopwork.ai/errors/state-invalid',

  /** State file is corrupted and cannot be recovered */
  ERR_STATE_CORRUPT: 'https://docs.loopwork.ai/errors/state-corrupt',

  /** Plugin Errors - Issues with plugin lifecycle or execution */

  /** Plugin failed during initialization */
  ERR_PLUGIN_INIT: 'https://docs.loopwork.ai/errors/plugin-init',

  /** Plugin hook threw an error during execution */
  ERR_PLUGIN_HOOK: 'https://docs.loopwork.ai/errors/plugin-hook',

  /** Process Errors - Issues with process management or cleanup */

  /** Failed to spawn child process */
  ERR_PROCESS_SPAWN: 'https://docs.loopwork.ai/errors/process-spawn',

  /** Failed to kill process - may lack permissions or process doesn't exist */
  ERR_PROCESS_KILL: 'https://docs.loopwork.ai/errors/process-kill',

  /** Monitor Errors - Issues with monitoring daemon lifecycle */

  /** Failed to start monitoring daemon */
  ERR_MONITOR_START: 'https://docs.loopwork.ai/errors/monitor-start',

  /** Failed to stop monitoring daemon */
  ERR_MONITOR_STOP: 'https://docs.loopwork.ai/errors/monitor-stop',

  /** Dashboard Errors - Issues with dashboard functionality */

  /** Feature not yet implemented */
  ERR_NOT_IMPLEMENTED: 'https://docs.loopwork.ai/errors/not-implemented',

  /** TUI mode not supported in this terminal */
  ERR_TUI_UNSUPPORTED: 'https://docs.loopwork.ai/errors/tui-unsupported',

  /** Generic Error - Fallback for uncategorized errors */

  /** An unknown or unexpected error occurred */
  ERR_UNKNOWN: 'https://docs.loopwork.ai/errors/unknown',
} as const

export type ErrorCode = keyof typeof ERROR_CODES

export class LoopworkError extends Error {
  public readonly code: ErrorCode

  constructor(
    code: ErrorCode,
    message: string,
    public suggestions: string[] = [],
    docsUrl?: string
  ) {
    super(message)
    this.name = 'LoopworkError'
    this.code = code
    // Use provided docsUrl or fall back to error code registry
    this.docsUrl = docsUrl || ERROR_CODES[code]
  }

  public readonly docsUrl: string
}

/**
 * Format error message with box drawing characters
 */
function formatErrorBox(code: ErrorCode, message: string, suggestions: string[], docsUrl: string): string {
  const width = 60
  const lines: string[] = []

  // Top border
  lines.push(chalk.red('╭─ ERROR ' + '─'.repeat(width - 9) + '╮'))

  // Error code and message
  const errorLine = `${code}: ${message}`
  const errorWords = errorLine.split(' ')
  let currentLine = '│ '

  for (const word of errorWords) {
    if (currentLine.length + word.length + 1 > width - 2) {
      lines.push(chalk.red(currentLine.padEnd(width - 1) + '│'))
      currentLine = '│ ' + word + ' '
    } else {
      currentLine += word + ' '
    }
  }
  if (currentLine.length > 2) {
    lines.push(chalk.red(currentLine.padEnd(width - 1) + '│'))
  }

  // Separator before suggestions
  if (suggestions.length > 0 || docsUrl) {
    lines.push(chalk.red('├' + '─'.repeat(width - 2) + '┤'))
  }

  // Suggestions
  for (const suggestion of suggestions) {
    const suggestionLine = `💡 ${suggestion}`
    const suggestionWords = suggestionLine.split(' ')
    currentLine = '│ '

    for (const word of suggestionWords) {
      if (currentLine.length + word.length + 1 > width - 2) {
        lines.push(chalk.yellow(currentLine.padEnd(width - 1)) + chalk.red('│'))
        currentLine = '│ ' + word + ' '
      } else {
        currentLine += word + ' '
      }
    }
    if (currentLine.length > 2) {
      lines.push(chalk.yellow(currentLine.padEnd(width - 1)) + chalk.red('│'))
    }
  }

  // Documentation URL
  if (docsUrl) {
    const docsLine = `📚 ${docsUrl}`
    lines.push(chalk.blue('│ ' + docsLine.padEnd(width - 3)) + chalk.red('│'))
  }

  // Bottom border
  lines.push(chalk.red('╰' + '─'.repeat(width - 2) + '╯'))

  return lines.join('\n')
}

export function handleError(error: unknown): void {
  if (error instanceof LoopworkError) {
    // Use formatted box for LoopworkError
    const formattedError = formatErrorBox(
      error.code,
      error.message,
      error.suggestions,
      error.docsUrl
    )
    logger.raw(formattedError)

    logger.debug(`LoopworkError [${error.code}]: ${error.message}\n${error.stack}`)
  } else if (error instanceof Error) {
    logger.error(error.message)
    if (process.env.LOOPWORK_DEBUG === 'true') {
      logger.debug(error.stack || 'No stack trace available')
    } else {
      logger.debug(`Error: ${error.message}\n${error.stack}`)
    }
  } else {
    logger.error(String(error))
    logger.debug(`Non-Error thrown: ${String(error)}`)
  }
}
