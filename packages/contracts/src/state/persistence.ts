/**
 * State Persistence Contracts
 *
 * These interfaces abstract low-level storage operations, enabling
 * pluggable backends (File, Redis, Memory, etc.).
 */

/**
 * Lock information returned by acquireLock operation.
 */
export interface LockInfo {
  /** Unique lock identifier */
  lockId: string

  /** Timestamp when lock was acquired */
  acquiredAt: Date

  /** Process ID that holds the lock */
  pid: number
}

/**
 * Raw persistence layer interface.
 *
 * Provides low-level storage operations without business logic.
 * Implementations can be File-based, Redis, Memory, or any other storage backend.
 */
export interface IPersistenceLayer {
  /**
   * Unique identifier for this persistence layer.
   * Used for logging and debugging.
   */
  readonly name: string

  /**
   * Initialize the persistence layer.
   * Called once before any other operations.
   */
  initialize?(): Promise<void>

  /**
   * Perform any cleanup before shutdown.
   */
  dispose?(): Promise<void>

  /**
   * Check if a key exists in storage.
   * @param key Storage key (can include namespace prefix)
   */
  exists(key: string): Promise<boolean>

  /**
   * Retrieve a value from storage.
   * @param key Storage key
   * @param type Optional type hint for deserialization
   * @returns Value if exists, null otherwise
   */
  get<T = unknown>(key: string): Promise<T | null>

  /**
   * Store a value in storage.
   * @param key Storage key
   * @param value Value to store (must be serializable)
   */
  set<T = unknown>(key: string, value: T): Promise<void>

  /**
   * Delete a value from storage.
   * @param key Storage key
   */
  delete(key: string): Promise<void>

  /**
   * Delete multiple keys matching a pattern.
   * Implementation-specific behavior (glob patterns for files, key patterns for Redis).
   * @param pattern Key pattern to match
   */
  deletePattern?(pattern: string): Promise<void>

  /**
   * List all keys in storage.
   * @param pattern Optional key pattern to filter results
   */
  keys(pattern?: string): Promise<string[]>

  /**
   * Acquire a distributed lock.
   * @param lockName Name of the lock to acquire
   * @param options Lock acquisition options
   * @returns Lock info if acquired, null if lock is held
   */
  acquireLock?(lockName: string, options?: LockOptions): Promise<LockInfo | null>

  /**
   * Release a previously acquired lock.
   * @param lockId Lock identifier returned by acquireLock
   */
  releaseLock?(lockId: string): Promise<void>

  /**
   * Check if a lock is currently held.
   * @param lockName Name of the lock to check
   */
  isLocked?(lockName: string): Promise<boolean>

  /**
   * Watch a key for changes.
   * @param key Storage key to watch
   * @param callback Function called when key changes
   * @returns Unwatch function (call to stop watching)
   */
  watch?(key: string, callback: (value: unknown) => void): Promise<() => void>

  /**
   * Execute an operation atomically.
   * Ensures no concurrent modifications during the operation.
   * @param key Key to operate on
   * @param operation Function that transforms the current value
   */
  atomicUpdate<T = unknown>(key: string, operation: (current: T | null) => T): Promise<void>

  /**
   * Perform a transaction across multiple operations.
   * All operations succeed or none succeed.
   * @param operations Array of operations to execute
   */
  transaction?(operations: TransactionOperation[]): Promise<void>

  /**
   * Get storage health metrics.
   * @returns Metrics about storage performance and health
   */
  healthCheck?(): Promise<StorageHealth>
}

/**
 * Options for acquiring locks.
 */
export interface LockOptions {
  /**
   * Maximum time to wait for lock acquisition (milliseconds).
   * 0 = return immediately (non-blocking).
   */
  timeout?: number

  /**
   * Time-to-live for the lock (milliseconds).
   * Automatically expires after this time to prevent deadlocks.
   */
  ttl?: number

  /**
   * Retry interval when blocking (milliseconds).
   */
  retryInterval?: number

  /**
   * Retry count before giving up.
   */
  maxRetries?: number
}

/**
 * Single operation in a transaction.
 */
export interface TransactionOperation {
  /** Operation type */
  type: 'set' | 'delete'

  /** Key to operate on */
  key: string

  /** Value to set (required for 'set' type) */
  value?: unknown
}

/**
 * Storage health metrics.
 */
export interface StorageHealth {
  /** Whether storage is healthy */
  healthy: boolean

  /** Last operation latency in milliseconds */
  latencyMs?: number

  /** Error message if unhealthy */
  error?: string

  /** Storage-specific metadata */
  metadata?: Record<string, unknown>
}

/**
 * Persistence layer configuration.
 */
export interface PersistenceConfig {
  /** Storage type identifier */
  type: string

  /** Namespace prefix for all keys */
  namespace?: string

  /** Default lock TTL (milliseconds) */
  defaultLockTtl?: number

  /** Enable/disable compression */
  compression?: boolean

  /** Enable/disable encryption */
  encryption?: boolean

  /** Storage-specific configuration */
  config?: Record<string, unknown>
}
