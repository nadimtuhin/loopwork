/**
 * Orchestration Contracts
 *
 * Defines the interfaces for namespace management, task orchestration,
 * and cluster state across multiple concurrent AI agents.
 */

/**
 * Namespace identifier for isolation.
 */
export type Namespace = string

/**
 * Lock identifier for namespace exclusion.
 */
export type LockId = string

/**
 * Timestamp for tracking operations.
 */
export type Timestamp = number

/**
 * List of namespace identifiers.
 */
export type NamespaceList = Namespace[]

/**
 * Result of a namespace operation.
 */
export interface NamespaceResult {
  /** Whether the operation succeeded */
  success: boolean

  /** Message describing the result */
  message: string

  /** Optional error details */
  error?: string
}

/**
 * Result of a lock operation.
 */
export interface LockResult {
  /** Whether the lock was acquired */
  success: boolean

  /** Lock identifier if acquired */
  lockId?: LockId

  /** Error message if acquisition failed */
  error?: string
}

/**
 * Namespace metadata for tracking and management.
 */
export interface NamespaceMetadata {
  /** Unique namespace identifier */
  id: Namespace

  /** Human-readable name */
  name: string

  /** Description of namespace purpose */
  description?: string

  /** Timestamp when namespace was created */
  createdAt: Timestamp

  /** Timestamp when namespace was last accessed */
  lastAccessed: Timestamp

  /** Whether the namespace is currently locked */
  locked: boolean

  /** Lock identifier if locked */
  lockId?: LockId

  /** Number of active agents in this namespace */
  activeAgents: number

  /** Custom metadata/key-value pairs */
  metadata?: Record<string, any>
}

/**
 * Interface for managing namespaces.
 *
 * Provides isolation and coordination for concurrent AI agent executions.
 */
export interface INamespaceManager {
  /**
   * Initialize the namespace manager.
   */
  initialize?(): Promise<void>

  /**
   * Cleanup resources before shutdown.
   */
  dispose?(): Promise<void>

  /**
   * Create a new namespace with the given configuration.
   * @param name Human-readable name
   * @param description Optional description
   * @returns Created namespace metadata or null if creation failed
   */
  createNamespace(name: string, description?: string): Promise<NamespaceMetadata | null>

  /**
   * List all available namespaces.
   * @returns Array of namespace metadata
   */
  listNamespaces(): NamespaceMetadata[]

  /**
   * Get metadata for a specific namespace.
   * @param id Namespace identifier
   * @returns Namespace metadata or undefined if not found
   */
  getNamespace(id: Namespace): NamespaceMetadata | undefined

  /**
   * Delete a namespace and all its resources.
   * @param id Namespace identifier
   * @returns Result of deletion operation
   */
  deleteNamespace(id: Namespace): Promise<NamespaceResult>

  /**
   * Acquire exclusive lock on a namespace to prevent concurrent executions.
   * @param id Namespace identifier
   * @returns Lock result with lock identifier
   */
  lockNamespace(id: Namespace): Promise<LockResult>

  /**
   * Release a previously acquired lock on a namespace.
   * @param id Namespace identifier
   * @returns Result of release operation
   */
  unlockNamespace(id: Namespace): Promise<NamespaceResult>

  /**
   * Check if a namespace is currently locked.
   * @param id Namespace identifier
   * @returns True if locked, false otherwise
   */
  isNamespaceLocked(id: Namespace): Promise<boolean>

  /**
   * Attempt to automatically acquire a lock on any available namespace.
   * Used when the coordinator needs to start an orchestration run.
   * @returns Lock result with namespace and lock identifier
   */
  acquireAnyLock(): Promise<LockResult | null>

  /**
   * Clean up stale or orphaned namespaces.
   * @param options Cleanup options
   * @returns Result of cleanup operation
   */
  cleanupNamespaces(options?: CleanupOptions): Promise<NamespaceResult>

  /**
   * Update the last accessed timestamp for a namespace.
   * @param id Namespace identifier
   */
  touchNamespace(id: Namespace): Promise<void>

  /**
   * Get the total count of namespaces.
   * @returns Number of namespaces
   */
  getNamespaceCount(): number
}

/**
 * Options for namespace cleanup.
 */
export interface CleanupOptions {
  /** Maximum age of namespace in milliseconds before cleanup */
  maxAge?: number

  /** Minimum number of active agents required to keep namespace */
  minActiveAgents?: number

  /** Whether to also delete namespaces with no active agents */
  deleteEmpty?: boolean
}

/**
 * Coordinator configuration.
 */
export interface CoordinatorConfig {
  /** Default namespace for coordination */
  defaultNamespace: Namespace

  /** Maximum concurrent namespaces allowed */
  maxConcurrentNamespaces: number

  /** Default lock timeout in milliseconds */
  defaultLockTimeout: number

  /** Enable namespace locking for safety */
  enableLocking: boolean
}

/**
 * Orchestration execution options.
 */
export interface OrchestrationOptions {
  /** Namespace to execute in */
  namespace: Namespace

  /** Maximum number of iterations */
  maxIterations: number

  /** Task ID or identifier */
  taskId: string

  /** Additional context for the orchestration */
  context?: Record<string, any>
}

/**
 * Orchestration result.
 */
export interface OrchestrationResult {
  /** Whether orchestration completed successfully */
  success: boolean

  /** Number of iterations completed */
  iterations: number

  /** Task ID that was processed */
  taskId: string

  /** Duration of execution in milliseconds */
  duration: number

  /** Final state of the cluster after execution */
  finalState: ClusterState

  /** Optional error details if failed */
  error?: string
}

/**
 * Interface for coordinating orchestration across multiple agents.
 *
 * Manages the lifecycle of agent executions, coordinates tasks across namespaces,
 * and ensures proper cleanup and resource management.
 */
export interface ICoordinator {
  /**
   * Initialize the coordinator.
   * @param config Coordinator configuration
   */
  initialize(config: CoordinatorConfig): Promise<void>

  /**
   * Cleanup resources before shutdown.
   */
  dispose?(): Promise<void>

  /**
   * Start an orchestration run in a specific namespace.
   * @param options Orchestration options
   * @returns Orchestration result
   */
  orchestrate(options: OrchestrationOptions): Promise<OrchestrationResult>

  /**
   * Stop an ongoing orchestration run.
   * @param namespace Namespace to stop in
   * @returns Result of stop operation
   */
  stop(namespace: Namespace): Promise<NamespaceResult>

  /**
   * Get the current state of the entire cluster.
   * @returns Current cluster state
   */
  getClusterState(): ClusterState

  /**
   * Check if a namespace can accept new orchestration tasks.
   * @param namespace Namespace identifier
   * @returns True if available
   */
  isNamespaceAvailable(namespace: Namespace): Promise<boolean>

  /**
   * Register an agent as active in a namespace.
   * @param namespace Namespace identifier
   * @param agentId Agent identifier
   */
  registerAgent(namespace: Namespace, agentId: string): void

  /**
   * Unregister an agent as inactive from a namespace.
   * @param namespace Namespace identifier
   * @param agentId Agent identifier
   */
  unregisterAgent(namespace: Namespace, agentId: string): void

  /**
   * Get the namespace manager instance.
   * @returns INamespaceManager instance
   */
  getNamespaceManager(): INamespaceManager
}

/**
 * Snapshot of cluster state for serialization.
 */
export interface ClusterStateSnapshot {
  /** List of all namespaces and their states */
  namespaces: Array<{
    id: Namespace
    name: string
    locked: boolean
    lockId?: LockId
    activeAgents: number
    createdAt: number
    lastAccessed: number
  }>

  /** Current timestamp */
  timestamp: number

  /** Number of active namespaces */
  activeNamespaces: number

  /** Number of locked namespaces */
  lockedNamespaces: number
}

/**
 * Current cluster state for runtime use.
 * This is the primary state object used by the coordinator.
 */
export interface ClusterState {
  /** List of all namespaces and their metadata */
  namespaces: Map<Namespace, NamespaceMetadata>

  /** Current timestamp */
  timestamp: number

  /** Number of active namespaces (with agents) */
  activeNamespaces: number

  /** Number of locked namespaces */
  lockedNamespaces: number

  /** Whether the cluster is in a healthy state */
  healthy: boolean
}

/**
 * Cluster state factory for creating initial states.
 */
export interface ClusterStateFactory {
  /** Create a new cluster state instance */
  create(config?: CoordinatorConfig): ClusterState
}

/**
 * Orchestration lifecycle events.
 */
export type OrchestrationEvent =
  | { type: 'orchestration-started'; namespace: Namespace; taskId: string }
  | { type: 'orchestration-progress'; namespace: Namespace; iteration: number }
  | { type: 'orchestration-completed'; namespace: Namespace; result: OrchestrationResult }
  | { type: 'orchestration-failed'; namespace: Namespace; error: string }
  | { type: 'orchestration-stopped'; namespace: Namespace }
  | { type: 'namespace-locked'; namespace: Namespace; lockId: LockId }
  | { type: 'namespace-unlocked'; namespace: Namespace }
  | { type: 'namespace-created'; namespace: Namespace }
  | { type: 'namespace-deleted'; namespace: Namespace }

/**
 * Event listener for orchestration lifecycle events.
 */
export type OrchestrationEventListener = (event: OrchestrationEvent) => void

/**
 * Coordinator events interface.
 */
export interface ICoordinatorEvents {
  /**
   * Register an event listener.
   * @param listener Callback for orchestration events
   */
  on(event: OrchestrationEvent['type'], listener: OrchestrationEventListener): void

  /**
   * Remove an event listener.
   * @param type Event type
   * @param listener Listener to remove
   */
  off(event: OrchestrationEvent['type'], listener: OrchestrationEventListener): void

  /**
   * Emit an event.
   * @param event Event to emit
   */
  emit(event: OrchestrationEvent): void
}
