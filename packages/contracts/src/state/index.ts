/**
 * State Management Contracts
 *
 * High-level state management interface built on IPersistenceLayer.
 * Implements business logic for session tracking, plugin state, and locking.
 */

import type { IPersistenceLayer } from './persistence'

/**
 * Point-in-time snapshot of execution state.
 * Represents the state saved for resume capability.
 */
export interface StateSnapshot {
  /** Current task/issue number being processed */
  lastIssue: number

  /** Iteration count within current task */
  lastIteration: number

  /** Directory where task outputs are stored */
  lastOutputDir: string

  /** Timestamp when snapshot was created */
  startedAt?: number
}

/**
 * Configuration for state manager.
 */
export interface StateManagerConfig {
  /** Namespace for state isolation */
  namespace: string

  /** Persistence layer implementation to use */
  persistence: IPersistenceLayer

  /** Enable debug logging */
  debug?: boolean

  /** Default time-to-live for locks (milliseconds) */
  defaultLockTtl?: number
}

/**
 * Result of state load operation.
 */
export interface LoadStateResult {
  /** Loaded state snapshot */
  snapshot: StateSnapshot | null

  /** Whether state was successfully loaded */
  success: boolean

  /** Error message if load failed */
  error?: string
}

/**
 * State manager interface.
 *
 * Provides high-level state management built on top of IPersistenceLayer.
 * Handles business logic for sessions, plugin state, and locking.
 */
export interface IStateManager {
  /**
   * Initialize state manager and underlying persistence.
   */
  initialize?(): Promise<void>

  /**
   * Cleanup resources before shutdown.
   */
  dispose?(): Promise<void>

  /**
   * Get the namespace for this state manager.
   */
  getNamespace(): string

  /**
   * Acquire exclusive lock to prevent concurrent executions.
   * @param retryCount Current retry attempt (internal use)
   * @returns True if lock acquired, false otherwise
   */
  acquireLock(retryCount?: number): Promise<boolean>

  /**
   * Release previously acquired lock.
   */
  releaseLock(): Promise<void>

  /**
   * Check if a lock is currently held.
   * @returns True if locked, false otherwise
   */
  isLocked(): Promise<boolean>

  /**
   * Save current execution state.
   * Enables resume capability with --resume flag.
   * @param currentIssue Current task/issue number
   * @param iteration Current iteration count
   */
  saveState(currentIssue: number, iteration: number): Promise<void>

  /**
   * Load previously saved execution state.
   * @returns Loaded snapshot or null if no state exists
   */
  loadState(): Promise<LoadStateResult>

  /**
   * Clear saved execution state.
   * Used when starting fresh without resuming.
   */
  clearState(): Promise<void>

  /**
   * Get state for a specific plugin.
   * Plugins can persist their own state between tasks.
   * @param pluginName Unique identifier for plugin
   * @returns Plugin state if exists, null otherwise
   */
  getPluginState<T = unknown>(pluginName: string): Promise<T | null>

  /**
   * Set state for a specific plugin.
   * @param pluginName Unique identifier for plugin
   * @param state State to persist
   */
  setPluginState<T = unknown>(pluginName: string, state: T): Promise<void>

  /**
   * Delete state for a specific plugin.
   * @param pluginName Unique identifier for plugin
   */
  deletePluginState(pluginName: string): Promise<void>

  /**
   * Check if plugin state exists.
   * @param pluginName Unique identifier for plugin
   */
  hasPluginState(pluginName: string): Promise<boolean>

  /**
   * List all plugins with saved state.
   * @returns Array of plugin names
   */
  listPlugins(): Promise<string[]>
}

/**
 * State manager factory.
 */
export interface IStateManagerConstructor {
  new (config: StateManagerConfig): IStateManager
}
