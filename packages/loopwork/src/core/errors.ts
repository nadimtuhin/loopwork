import { logger, errorRegistry } from './utils'
import chalk from 'chalk'
import type { ErrorCode, IErrorGuidance } from '@loopwork-ai/contracts'

export type { ErrorCode } from '@loopwork-ai/contracts'

/**
 * Error code registry entry containing documentation and default suggestions
 */
interface ErrorCodeEntry {
  /** The error code identifier */
  code: ErrorCode
  /** Human-readable description of the error category */
  description: string
  /** Documentation URL for this error type */
  docsUrl: string
  /** Default suggestions for resolving this error */
  suggestions: string[]
}

/**
 * Comprehensive error code registry documenting all Loopwork error codes
 *
 * This registry serves as the source of truth for:
 * - Error code documentation URLs
 * - Default suggestions for each error type
 * - Error code descriptions for debugging and logging
 *
 * Usage:
 * ```typescript
 * import { ERROR_CODES } from './core/errors'
 *
 * // Get docs URL for an error code
 * const docsUrl = ERROR_CODES.ERR_LOCK_CONFLICT.docsUrl
 *
 * // Get default suggestions
 * const suggestions = ERROR_CODES.ERR_CONFIG_INVALID.suggestions
 * ```
 */
export const ERROR_CODES: Record<ErrorCode, ErrorCodeEntry> = {
  // ==================== Configuration Errors ====================
  ERR_CONFIG_INVALID: {
    code: 'ERR_CONFIG_INVALID',
    description: 'Invalid or malformed configuration',
    docsUrl: 'https://docs.loopwork.ai/errors/config-invalid',
    suggestions: [
      'Check your loopwork.config.ts for syntax errors',
      'Verify all required fields are present and correctly typed',
      'Run: bun run loopwork --help to see configuration options',
    ],
  },

  ERR_CONFIG_MISSING: {
    code: 'ERR_CONFIG_MISSING',
    description: 'Configuration file not found',
    docsUrl: 'https://docs.loopwork.ai/errors/config-missing',
    suggestions: [
      'Create a loopwork.config.ts file in your project root',
      'Run: loopwork init to generate a starter configuration',
      'Check that the config file path is correct',
    ],
  },

  ERR_CONFIG_LOAD: {
    code: 'ERR_CONFIG_LOAD',
    description: 'Failed to load configuration',
    docsUrl: 'https://docs.loopwork.ai/errors/config-load',
    suggestions: [
      'Check that loopwork.config.ts exports a valid configuration',
      'Verify TypeScript syntax is correct',
      'Ensure all required plugins are installed',
    ],
  },

  ERR_ENV_INVALID: {
    code: 'ERR_ENV_INVALID',
    description: 'Invalid environment variable',
    docsUrl: 'https://docs.loopwork.ai/errors/env-invalid',
    suggestions: [
      'Check required environment variables are set',
      'Verify environment variable formats and values',
      'See documentation for required env vars',
    ],
  },

  // ==================== Backend Errors ====================
  ERR_BACKEND_INVALID: {
    code: 'ERR_BACKEND_INVALID',
    description: 'Invalid backend configuration',
    docsUrl: 'https://docs.loopwork.ai/errors/backend-invalid',
    suggestions: [
      'Verify backend type is one of: json, github',
      'Check backend-specific configuration options',
      'Ensure required credentials are provided',
    ],
  },

  ERR_BACKEND_INIT: {
    code: 'ERR_BACKEND_INIT',
    description: 'Backend initialization failed',
    docsUrl: 'https://docs.loopwork.ai/errors/backend-init',
    suggestions: [
      'Check backend connection and credentials',
      'Verify required permissions for the backend',
      'Check network connectivity',
    ],
  },

  // ==================== Task Errors ====================
  ERR_TASK_NOT_FOUND: {
    code: 'ERR_TASK_NOT_FOUND',
    description: 'Task not found in the backend',
    docsUrl: 'https://docs.loopwork.ai/errors/task-not-found',
    suggestions: [
      'Verify the task ID is correct',
      'Check if the task exists in the backend',
      'Run: loopwork status to list available tasks',
    ],
  },

  ERR_TASK_INVALID: {
    code: 'ERR_TASK_INVALID',
    description: 'Task is in an invalid state',
    docsUrl: 'https://docs.loopwork.ai/errors/task-invalid',
    suggestions: [
      'Check the task status is valid for this operation',
      'Verify all required task fields are present',
      'Ensure task dependencies are satisfied',
    ],
  },

  // ==================== File Errors ====================
  ERR_FILE_NOT_FOUND: {
    code: 'ERR_FILE_NOT_FOUND',
    description: 'File not found',
    docsUrl: 'https://docs.loopwork.ai/errors/file-not-found',
    suggestions: [
      'Verify the file path is correct',
      'Check file permissions',
      'Ensure the file has not been deleted or moved',
    ],
  },

  ERR_FILE_READ: {
    code: 'ERR_FILE_READ',
    description: 'Failed to read file',
    docsUrl: 'https://docs.loopwork.ai/errors/file-read',
    suggestions: [
      'Check file permissions',
      'Verify file is not locked by another process',
      'Ensure sufficient disk space',
    ],
  },

  ERR_FILE_WRITE: {
    code: 'ERR_FILE_WRITE',
    description: 'Failed to write file',
    docsUrl: 'https://docs.loopwork.ai/errors/file-write',
    suggestions: [
      'Check write permissions in the target directory',
      'Verify disk space is available',
      'Ensure file is not locked by another process',
    ],
  },

  // ==================== Process Errors ====================
  ERR_PROCESS_SPAWN: {
    code: 'ERR_PROCESS_SPAWN',
    description: 'Failed to spawn process',
    docsUrl: 'https://docs.loopwork.ai/errors/process-spawn',
    suggestions: [
      'Check the command exists and is executable',
      'Verify command-line arguments are valid',
      'Check system resource limits',
    ],
  },

  ERR_PROCESS_KILL: {
    code: 'ERR_PROCESS_KILL',
    description: 'Failed to terminate process',
    docsUrl: 'https://docs.loopwork.ai/errors/process-kill',
    suggestions: [
      'Process may have already terminated',
      'Check process permissions',
      'Try manually: kill -9 <pid>',
    ],
  },

  // ==================== CLI Execution Errors ====================
  ERR_CLI_NOT_FOUND: {
    code: 'ERR_CLI_NOT_FOUND',
    description: 'AI CLI tool not found',
    docsUrl: 'https://docs.loopwork.ai/errors/cli-not-found',
    suggestions: [
      'Install the AI CLI tool from the official source',
      'Ensure the CLI is in your system PATH',
      'Update loopwork.config.ts to use an available CLI',
    ],
  },

  ERR_CLI_EXEC: {
    code: 'ERR_CLI_EXEC',
    description: 'CLI execution failed',
    docsUrl: 'https://docs.loopwork.ai/errors/cli-exec',
    suggestions: [
      'Check the command output for specific errors',
      'Verify the CLI tool is properly authenticated',
      'Try running the command manually to diagnose',
    ],
  },

  // ==================== Lock Errors ====================
  ERR_LOCK_CONFLICT: {
    code: 'ERR_LOCK_CONFLICT',
    description: 'Failed to acquire state lock',
    docsUrl: 'https://docs.loopwork.ai/errors/lock-conflict',
    suggestions: [
      'Wait for the other instance to finish',
      'Check for running loopwork processes',
      'Manually remove stale lock file: rm .loopwork/loopwork.lock',
    ],
  },

  ERR_STATE_INVALID: {
    code: 'ERR_STATE_INVALID',
    description: 'Invalid state file',
    docsUrl: 'https://docs.loopwork.ai/errors/state-invalid',
    suggestions: [
      'The state file may be corrupted',
      'Try: loopwork start --resume=false',
      'Manually remove state: rm .loopwork/state.json',
    ],
  },

  // ==================== Plugin Errors ====================
  ERR_PLUGIN_LOAD: {
    code: 'ERR_PLUGIN_LOAD',
    description: 'Plugin failed to load',
    docsUrl: 'https://docs.loopwork.ai/errors/plugin-load',
    suggestions: [
      'Check plugin configuration is valid',
      'Verify plugin dependencies are installed',
      'Check plugin documentation for setup requirements',
    ],
  },

  // ==================== Safety Errors ====================
  ERR_SAFETY_VIOLATION: {
    code: 'ERR_SAFETY_VIOLATION',
    description: 'Safety check violation',
    docsUrl: 'https://docs.loopwork.ai/errors/safety-violation',
    suggestions: [
      'Review the safety violation reason',
      'Modify the command to comply with safety rules',
      'Adjust safety configuration if needed',
    ],
  },

  // ==================== Monitor Errors ====================
  ERR_MONITOR_START: {
    code: 'ERR_MONITOR_START',
    description: 'Failed to start monitor',
    docsUrl: 'https://docs.loopwork.ai/errors/monitor-start',
    suggestions: [
      'Check if port is already in use',
      'Verify monitor configuration is valid',
      'Ensure sufficient system resources',
    ],
  },

  // ==================== TUI Errors ====================
  ERR_TUI_UNSUPPORTED: {
    code: 'ERR_TUI_UNSUPPORTED',
    description: 'TUI mode not supported',
    docsUrl: 'https://docs.loopwork.ai/errors/tui-unsupported',
    suggestions: [
      'TUI requires an interactive terminal',
      'Use --json flag for non-interactive output',
      'Redirect output to a file for logging',
    ],
  },

  // ==================== Preflight Errors ====================
  ERR_PREFLIGHT_FAILED: {
    code: 'ERR_PREFLIGHT_FAILED',
    description: 'Preflight checks failed',
    docsUrl: 'https://docs.loopwork.ai/errors/preflight-failed',
    suggestions: [
      'Review preflight failure messages',
      'Fix the indicated issues before continuing',
      'Run with --verbose for detailed diagnostics',
    ],
  },

  // ==================== LLM Analyzer Errors ====================
  ERR_LLM_ANALYSIS: {
    code: 'ERR_LLM_ANALYSIS',
    description: 'LLM analysis failed',
    docsUrl: 'https://docs.loopwork.ai/errors/llm-analysis',
    suggestions: [
      'Check LLM provider credentials',
      'Verify model configuration is valid',
      'Try with a different model or provider',
    ],
  },

  // ==================== Unknown Errors ====================
  ERR_UNKNOWN: {
    code: 'ERR_UNKNOWN',
    description: 'Unknown error occurred',
    docsUrl: 'https://docs.loopwork.ai/errors/unknown',
    suggestions: [
      'Check logs for more detailed error information',
      'Try running with --debug for additional context',
      'Report the issue if the error persists',
    ],
  },

  // ==================== Testing Errors ====================
  ERR_TEST: {
    code: 'ERR_TEST',
    description: 'Test error (for testing purposes only)',
    docsUrl: 'https://docs.loopwork.ai/errors/test',
    suggestions: [
      'This error is only used in tests',
      'If you see this in production, please report a bug',
    ],
  },

  // ==================== Chaos Engineering Errors ====================
  ERR_CHAOS_INJECTION: {
    code: 'ERR_CHAOS_INJECTION',
    description: 'Chaos engineering fault injection',
    docsUrl: 'https://docs.loopwork.ai/errors/chaos-injection',
    suggestions: [
      'This error was intentionally injected for testing',
      'If unexpected, check chaos configuration',
      'Disable chaos mode if not required',
    ],
  },
} as const

/**
 * Get the error code entry from the registry
 */
export function getErrorCodeEntry(code: ErrorCode): ErrorCodeEntry | undefined {
  return ERROR_CODES[code]
}

/**
 * Get documentation URL for an error code
 */
export function getErrorDocsUrl(code: ErrorCode): string {
  return ERROR_CODES[code]?.docsUrl ?? `https://docs.loopwork.ai/errors/${code.toLowerCase().replace(/^err_/, '').replace(/_/g, '-')}`
}

/**
 * Get default suggestions for an error code
 */
export function getErrorSuggestions(code: ErrorCode): string[] {
  return ERROR_CODES[code]?.suggestions ?? []
}

/**
 * Get description for an error code
 */
export function getErrorDescription(code: ErrorCode): string {
  return ERROR_CODES[code]?.description ?? 'Unknown error'
}

/**
 * Get all registered error codes
 */
export function getAllErrorCodes(): ErrorCode[] {
  return Object.keys(ERROR_CODES) as ErrorCode[]
}

/**
 * Check if an error code is registered
 */
export function isRegisteredErrorCode(code: ErrorCode): boolean {
  return code in ERROR_CODES
}

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
    // Use provided docsUrl or fall back to ERROR_CODES registry
    this.docsUrl = docsUrl || getErrorDocsUrl(code)
  }

  public readonly docsUrl: string
}

/**
 * Error thrown when chaos engineering fault is injected
 */
export class ChaosError extends LoopworkError {
  constructor(message: string = 'Chaos injection triggered') {
    super('ERR_CHAOS_INJECTION', message)
    this.name = 'ChaosError'
  }
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
    // Get suggestions from error object or fallback to external registry
    // Priority: error.suggestions (if non-empty) > external registry > empty array
    let suggestions: string[]

    if (error.suggestions.length > 0) {
      suggestions = error.suggestions
    } else if (errorRegistry) {
      // Use external registry if set (for backward compatibility)
      const guidance = errorRegistry as unknown as IErrorGuidance
      suggestions = guidance.getSuggestions ? guidance.getSuggestions(error.code) : []
    } else {
      // No registry set, use empty suggestions
      suggestions = []
    }

    // Use formatted box for LoopworkError
    const formattedError = formatErrorBox(
      error.code,
      error.message,
      suggestions,
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

/**
 * Create a user-friendly error for missing CLI tool
 */
export function createCliNotFoundError(cliName: string, suggestedInstall: string): LoopworkError {
  const suggestions: string[] = [
    `Install ${cliName} from: ${suggestedInstall}`,
    `Or update your config to use a different CLI: loopwork.config.ts`,
  ]

  // Add path check suggestion
  if (cliName === 'claude') {
    suggestions.push('Ensure Claude Code is in your PATH: which claude')
  } else if (cliName === 'opencode') {
    suggestions.push('Ensure OpenCode is in your PATH: which opencode')
  }

  return new LoopworkError(
    'ERR_CLI_NOT_FOUND',
    `AI CLI '${cliName}' not found in PATH`,
    suggestions
  )
}

/**
 * Create a user-friendly error for no tasks available
 */
export function createNoTasksError(tasksFile: string): LoopworkError {
  return new LoopworkError(
    'ERR_TASK_NOT_FOUND',
    'No pending tasks found',
    [
      `Create tasks in ${tasksFile}`,
      'Or run: loopwork task-new --title "Your task" --priority high',
      'Example: Add a task with status "pending" in the tasks array',
    ]
  )
}

/**
 * Create a user-friendly error for rate limiting with wait info
 */
export function createRateLimitError(waitSeconds: number, retryAfter?: number): LoopworkError {
  const actualWait = retryAfter || waitSeconds
  return new LoopworkError(
    'ERR_CLI_EXEC',
    `Rate limit reached, waiting ${actualWait} seconds...`,
    [
      `Consider upgrading your API tier for higher limits`,
      'Rate limits are per-minute, waiting will automatically retry',
      'You can also reduce concurrency with: --parallel 1',
    ]
  )
}

/**
 * Create a user-friendly error for task execution failure
 */
export function createTaskFailureError(
  taskId: string,
  command: string,
  exitCode: number,
  prdPath: string
): LoopworkError {
  return new LoopworkError(
    'ERR_CLI_EXEC',
    `Task ${taskId} failed: Command '${command}' exited with code ${exitCode}`,
    [
      `Check task requirements in ${prdPath}`,
      `Run manually: ${command}`,
      `Skip task: loopwork deadletter retry ${taskId}`,
      `View logs: loopwork logs --task ${taskId.replace('TASK-', '')}`,
    ]
  )
}
