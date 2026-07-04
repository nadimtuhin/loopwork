import type { ErrorCode } from './index'
import type { IErrorRegistry, IErrorGuidance } from '@loopwork-ai/contracts'

/**
 * Error code entry containing all metadata for an error
 */
interface ErrorCodeEntry {
  /** The error code identifier */
  code: string
  /** Human-readable description of the error */
  message: string
  /** URL to documentation for this error */
  docsUrl: string
  /** Suggestions for resolving this error */
  suggestions: string[]
}

/**
 * Centralized Error Registry for Loopwork
 * 
 * Manages error codes, messages, documentation URLs, and resolution suggestions.
 * Provides lookup functionality for error guidance and troubleshooting.
 * 
 * @example
 * ```typescript
 * import { centralErrorRegistry } from './registry'
 * 
 * // Get documentation URL for an error
 * const url = centralErrorRegistry.getDocsUrl('ERR_FILE_NOT_FOUND')
 * 
 * // Get suggestions for resolving an error
 * const suggestions = centralErrorRegistry.getSuggestions('ERR_FILE_NOT_FOUND', { path: '/some/file' })
 * ```
 */
export class CentralErrorRegistry implements IErrorRegistry, IErrorGuidance {
  private registry: Map<string, ErrorCodeEntry> = new Map()
  private defaultDocsBaseUrl: string
  private defaultSuggestions: Map<string, string[]> = new Map()

  constructor(options?: { docsBaseUrl?: string }) {
    this.defaultDocsBaseUrl = options?.docsBaseUrl ?? 'https://docs.loopwork.ai/errors'
    this.initializeDefaultErrors()
  }

  /**
   * Initialize with the standard Loopwork error codes
   */
  private initializeDefaultErrors(): void {
    // Lock & File System Errors
    this.registerError(
      'ERR_LOCK_CONFLICT',
      'Failed to acquire file lock - another process may be using the resource',
      'lock-conflict',
      [
        'Check if another Loopwork process is running',
        'Wait for the other process to complete or terminate it',
        'Remove stale lock files if no other process is running'
      ]
    )

    this.registerError(
      'ERR_FILE_NOT_FOUND',
      'Required file not found at expected path',
      'file-not-found',
      [
        'Verify the file path is correct',
        'Check file permissions',
        'Ensure the file has not been moved or deleted'
      ]
    )

    this.registerError(
      'ERR_FILE_WRITE',
      'Failed to write to file - check permissions and disk space',
      'file-write',
      [
        'Check write permissions for the target directory',
        'Verify sufficient disk space is available',
        'Ensure the file is not locked by another process'
      ]
    )

    this.registerError(
      'ERR_FILE_READ',
      'Failed to read from file - check file exists and has read permissions',
      'file-read',
      [
        'Verify the file exists at the specified path',
        'Check read permissions for the file',
        'Ensure the file is not corrupted'
      ]
    )

    // Configuration Errors
    this.registerError(
      'ERR_CONFIG_INVALID',
      'Configuration file contains invalid data or schema violations',
      'config-invalid',
      [
        'Review the configuration file for syntax errors',
        'Check that all required fields are present',
        'Validate the configuration against the schema',
        'See the configuration documentation for guidance'
      ]
    )

    this.registerError(
      'ERR_CONFIG_MISSING',
      'Required configuration file not found',
      'config-missing',
      [
        'Ensure loopwork.config.ts exists in the project root',
        'Check the config file path is correct',
        'Run "loopwork init" to generate a default configuration'
      ]
    )

    this.registerError(
      'ERR_CONFIG_LOAD',
      'Failed to load or parse configuration file',
      'config-load',
      [
        'Check for syntax errors in the configuration file',
        'Verify all imported modules are available',
        'Ensure TypeScript compilation succeeds'
      ]
    )

    this.registerError(
      'ERR_ENV_INVALID',
      'Environment variable has invalid value or format',
      'env-invalid',
      [
        'Check the environment variable format',
        'Verify required environment variables are set',
        'Review the documentation for expected environment variable formats'
      ]
    )

    // CLI Errors
    this.registerError(
      'ERR_CLI_NOT_FOUND',
      'CLI tool not found in PATH or expected locations',
      'cli-not-found',
      [
        'Install the CLI tool from the official source',
        'Ensure the CLI is in your PATH environment variable',
        'Verify the CLI executable has proper permissions'
      ]
    )

    this.registerError(
      'ERR_CLI_EXEC',
      'CLI tool failed during execution',
      'cli-exec',
      [
        'Check the command output for specific error messages',
        'Verify the CLI tool is properly authenticated',
        'Ensure required dependencies are installed',
        'Try running the command manually to see detailed errors'
      ]
    )

    this.registerError(
      'ERR_CLI_TIMEOUT',
      'CLI tool exceeded timeout and was terminated',
      'cli-timeout',
      [
        'Increase the timeout value in configuration',
        'Check if the CLI tool is hanging or stuck',
        'Verify network connectivity if the CLI makes external calls',
        'Consider simplifying the task to reduce execution time'
      ]
    )

    this.registerError(
      'ERR_PREFLIGHT_FAILED',
      'Pre-flight validation failed',
      'preflight-failed',
      [
        'Review the pre-flight check results',
        'Ensure all prerequisites are met',
        'Check system requirements and dependencies'
      ]
    )

    // Backend Errors
    this.registerError(
      'ERR_BACKEND_INVALID',
      'Backend configuration is invalid or incompatible',
      'backend-invalid',
      [
        'Review the backend configuration',
        'Ensure required backend dependencies are installed',
        'Check backend compatibility with your Loopwork version'
      ]
    )

    this.registerError(
      'ERR_BACKEND_INIT',
      'Failed to initialize backend - check configuration and dependencies',
      'backend-init',
      [
        'Verify backend configuration is correct',
        'Check that required credentials are set',
        'Ensure network connectivity for remote backends',
        'Review backend-specific initialization requirements'
      ]
    )

    // Task Errors
    this.registerError(
      'ERR_TASK_NOT_FOUND',
      'Requested task ID not found in backend',
      'task-not-found',
      [
        'Verify the task ID is correct',
        'Check if the task has been deleted or moved',
        'List available tasks to find the correct ID',
        'Ensure you are using the correct backend'
      ]
    )

    this.registerError(
      'ERR_TASK_INVALID',
      'Task data is invalid or malformed',
      'task-invalid',
      [
        'Review the task definition for syntax errors',
        'Ensure all required fields are present',
        'Validate the task against the task schema',
        'Check for circular dependencies or invalid references'
      ]
    )

    this.registerError(
      'ERR_TASK_DEPS',
      'Task dependencies cannot be resolved or are circular',
      'task-deps',
      [
        'Review the dependency chain for circular references',
        'Ensure all dependency tasks exist',
        'Check that dependent tasks are not in an invalid state',
        'Consider restructuring the task hierarchy'
      ]
    )

    // State Errors
    this.registerError(
      'ERR_STATE_INVALID',
      'State data has invalid format or missing required fields',
      'state-invalid',
      [
        'The state file may be corrupted or from an older version',
        'Try resuming with --force or start fresh',
        'Check the state file permissions'
      ]
    )

    this.registerError(
      'ERR_STATE_CORRUPT',
      'State file is corrupted and cannot be recovered',
      'state-corrupt',
      [
        'The state file appears to be corrupted',
        'Try removing the state file and starting fresh',
        'Ensure proper file permissions are set'
      ]
    )

    // Checkpoint Errors
    this.registerError(
      'ERR_CHECKPOINT_INVALID',
      'Checkpoint not found or integrity validation failed',
      'checkpoint-invalid',
      [
        'The checkpoint may be corrupted or incompatible',
        'Try resuming without the checkpoint',
        'Ensure the checkpoint was created with a compatible version'
      ]
    )

    this.registerError(
      'ERR_CHECKPOINT_INCOMPATIBLE',
      'Checkpoint is incompatible with current configuration',
      'checkpoint-incompatible',
      [
        'The checkpoint was created with a different configuration',
        'Try resuming with the original configuration',
        'Consider starting fresh with the current configuration'
      ]
    )

    // Plugin Errors
    this.registerError(
      'ERR_PLUGIN_NOT_FOUND',
      'Required plugin not found',
      'plugin-not-found',
      [
        'Verify the plugin name is correct',
        'Ensure the plugin is installed and registered',
        'Check the plugin configuration'
      ]
    )

    this.registerError(
      'ERR_PLUGIN_LOAD',
      'Failed to load plugin module',
      'plugin-load',
      [
        'Check the plugin module for syntax errors',
        'Ensure all plugin dependencies are installed',
        'Verify the plugin is compatible with your Loopwork version'
      ]
    )

    this.registerError(
      'ERR_PLUGIN_INVALID',
      'Plugin object or factory is invalid',
      'plugin-invalid',
      [
        'The plugin does not implement the required interface',
        'Review the plugin implementation',
        'Ensure the plugin exports the correct factory function'
      ]
    )

    this.registerError(
      'ERR_PLUGIN_INIT',
      'Plugin failed during initialization',
      'plugin-init',
      [
        'Check plugin configuration and credentials',
        'Review plugin initialization code for errors',
        'Ensure required external services are available'
      ]
    )

    this.registerError(
      'ERR_PLUGIN_HOOK',
      'Plugin hook threw an error during execution',
      'plugin-hook',
      [
        'Check the plugin hook implementation for errors',
        'Review the error context for specific failure details',
        'Consider disabling the plugin if the issue persists'
      ]
    )

    // Process Errors
    this.registerError(
      'ERR_PROCESS_SPAWN',
      'Failed to spawn child process',
      'process-spawn',
      [
        'Check system resources (memory, file descriptors)',
        'Verify the process executable exists and is valid',
        'Check for permission issues',
        'Review system logs for additional details'
      ]
    )

    this.registerError(
      'ERR_PROCESS_KILL',
      'Failed to kill process - may lack permissions or process does not exist',
      'process-kill',
      [
        'Verify the process still exists',
        'Check permissions to terminate the process',
        'Try killing the process manually'
      ]
    )

    this.registerError(
      'ERR_RESOURCE_EXHAUSTED',
      'Process exceeded resource limits (CPU/Memory) and was terminated',
      'resource-exhausted',
      [
        'The task may be using excessive resources',
        'Consider breaking the task into smaller parts',
        'Review system resource limits and adjust if needed'
      ]
    )

    // Monitor Errors
    this.registerError(
      'ERR_MONITOR_START',
      'Failed to start monitoring daemon',
      'monitor-start',
      [
        'Check if another monitor process is running',
        'Verify port availability for the monitor',
        'Review system resources and permissions'
      ]
    )

    this.registerError(
      'ERR_MONITOR_STOP',
      'Failed to stop monitoring daemon',
      'monitor-stop',
      [
        'Check if the monitor process is still running',
        'Try killing the monitor process manually',
        'Verify permissions to stop the process'
      ]
    )

    // Safety Errors
    this.registerError(
      'ERR_SAFETY_VIOLATION',
      'Action or command blocked by safety policy',
      'safety-violation',
      [
        'Review the safety policy that was triggered',
        'Modify the task to comply with safety guidelines',
        'Contact your administrator if you believe this is an error'
      ]
    )

    // Dashboard Errors
    this.registerError(
      'ERR_TUI_UNSUPPORTED',
      'Dashboard requires a terminal with full TUI support',
      'tui-unsupported',
      [
        'Ensure you are running in a proper terminal',
        'Check terminal size (minimum 80x24 required)',
        'Avoid running in non-interactive shells or CI environments',
        'Use --output json flag for non-TTY environments'
      ]
    )

    // Worker Pool Errors
    this.registerError(
      'ERR_POOL_SLOT_TIMEOUT',
      'Timeout waiting for a worker pool slot to become available',
      'pool-slot-timeout',
      [
        'The worker pool may be saturated',
        'Consider increasing pool size or reducing concurrency',
        'Wait for current tasks to complete',
        'Check for stuck or slow tasks blocking pool slots'
      ]
    )

    // Chaos Engineering Errors
    this.registerError(
      'ERR_CHAOS_INJECTION',
      'Task failed due to chaos engineering fault injection',
      'chaos-injection',
      [
        'This error was intentionally injected for testing',
        'Review chaos engineering configuration',
        'Consider adjusting chaos injection rules'
      ]
    )

    // Generic Error
    this.registerError(
      'ERR_UNKNOWN',
      'An unknown or unexpected error occurred',
      'unknown',
      [
        'Check the error details for more information',
        'Review logs for additional context',
        'Consider filing a bug report if this is unexpected',
        'Enable debug mode for more detailed logging'
      ]
    )
  }

  /**
   * Register a new error code with its metadata
   */
  registerError(
    code: string,
    message: string,
    docsPath: string,
    suggestions: string[] = []
  ): void {
    const docsUrl = `${this.defaultDocsBaseUrl}/${docsPath}`
    this.registry.set(code, {
      code,
      message,
      docsUrl,
      suggestions
    })
  }

  // IErrorRegistry implementation

  /**
   * Register an error code with its documentation URL
   */
  register(code: string, docsUrl: string): void {
    const entry = this.registry.get(code)
    if (entry) {
      entry.docsUrl = docsUrl
    } else {
      this.registry.set(code, {
        code,
        message: `Error: ${code}`,
        docsUrl,
        suggestions: ['Check the error documentation for more information']
      })
    }
  }

  /**
   * Get documentation URL for an error code
   */
  getDocsUrl(code: string): string | undefined {
    const entry = this.registry.get(code)
    if (entry) {
      return entry.docsUrl
    }
    // Return a generated URL for unknown codes
    return `${this.defaultDocsBaseUrl}/unknown?code=${encodeURIComponent(code)}`
  }

  /**
   * Check if an error code is registered
   */
  has(code: string): boolean {
    return this.registry.has(code)
  }

  /**
   * Get all registered error codes
   */
  getAllCodes(): string[] {
    return Array.from(this.registry.keys())
  }

  /**
   * Get the error entry for a specific code
   */
  getErrorEntry(code: string): ErrorCodeEntry | undefined {
    return this.registry.get(code)
  }

  // IErrorGuidance implementation

  /**
   * Generate suggestions for resolving an error
   */
  getSuggestions(code: string, _context?: Record<string, unknown>): string[] {
    const entry = this.registry.get(code)
    if (entry) {
      return [...entry.suggestions]
    }
    // Return default suggestions for unknown codes
    return [
      'Check the error message for specific details',
      'Enable debug mode with --debug for more information',
      'Review the logs for additional context',
      'Check the documentation at: https://docs.loopwork.ai/troubleshooting'
    ]
  }

  /**
   * Get troubleshooting URL for an error code
   */
  getTroubleshootingUrl(code: string): string {
    const docsUrl = this.getDocsUrl(code)
    if (docsUrl) {
      return docsUrl.replace('/errors/', '/troubleshooting/')
    }
    return `${this.defaultDocsBaseUrl}/troubleshooting`
  }

  /**
   * Format error message with suggestions and documentation link
   */
  formatError(code: string, message: string, suggestions?: string[]): string {
    const entry = this.registry.get(code)
    const allSuggestions = suggestions ?? this.getSuggestions(code)
    const docsUrl = this.getDocsUrl(code)

    const parts: string[] = [
      `Error [${code}]: ${message}`
    ]

    if (allSuggestions.length > 0) {
      parts.push('')
      parts.push('Suggestions:')
      allSuggestions.forEach((suggestion, index) => {
        parts.push(`  ${index + 1}. ${suggestion}`)
      })
    }

    if (docsUrl) {
      parts.push('')
      parts.push(`Documentation: ${docsUrl}`)
    }

    return parts.join('\n')
  }

  /**
   * Get error message for a code
   */
  getMessage(code: string): string | undefined {
    const entry = this.registry.get(code)
    if (entry) {
      return entry.message
    }
    return undefined
  }

  /**
   * Get all error codes with their full entries
   */
  getAllEntries(): ErrorCodeEntry[] {
    return Array.from(this.registry.values())
  }

  /**
   * Clear all registered error codes (useful for testing)
   */
  clear(): void {
    this.registry.clear()
  }

  /**
   * Remove a specific error code from the registry
   */
  unregister(code: string): boolean {
    return this.registry.delete(code)
  }

  /**
   * Get the count of registered error codes
   */
  size(): number {
    return this.registry.size
  }

  /**
   * Check if the registry is empty
   */
  isEmpty(): boolean {
    return this.registry.size === 0
  }
}

/**
 * Singleton instance of CentralErrorRegistry for global access
 */
export const centralErrorRegistry = new CentralErrorRegistry()

/**
 * Helper function to get error documentation URL
 */
export function getErrorDocsUrl(code: string): string {
  return centralErrorRegistry.getDocsUrl(code) ?? `${centralErrorRegistry.getDocsUrl('ERR_UNKNOWN')}?code=${encodeURIComponent(code)}`
}

/**
 * Helper function to get error suggestions
 */
export function getErrorSuggestions(code: string, context?: Record<string, unknown>): string[] {
  return centralErrorRegistry.getSuggestions(code, context)
}

/**
 * Helper function to format an error with suggestions
 */
export function formatErrorMessage(code: string, message: string, suggestions?: string[]): string {
  return centralErrorRegistry.formatError(code, message, suggestions)
}
