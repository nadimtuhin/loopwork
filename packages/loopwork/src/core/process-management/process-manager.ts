import type { ChildProcess } from 'child_process'
import type {
  IProcessManager,
  ProcessMetadata,
  ProcessInfo,
  CleanupResult,
  SpawnOptions as ISpawnOptions
} from '../../contracts/process-manager'
import type { ProcessSpawner } from '../../contracts/spawner'
import { ProcessRegistry } from './registry'
import { OrphanDetector } from './orphan-detector'
import { ProcessCleaner } from './cleaner'
import { createSpawner } from '../spawners'

/**
 * ProcessManager - Orchestrates process lifecycle, tracking, and cleanup
 *
 * Composes ProcessRegistry, OrphanDetector, ProcessCleaner, and ProcessSpawner
 * to provide a unified interface for managing child processes.
 *
 * Key Features:
 * - Auto-tracking: Spawned processes automatically added to registry
 * - Auto-untracking: Processes removed from registry on exit
 * - Orphan detection: Three detection methods (dead parent, untracked, stale)
 * - Graceful cleanup: SIGTERM → wait → SIGKILL sequence
 * - Persistence: State survives crashes via registry persistence
 */
export class ProcessManager implements IProcessManager {
  constructor(
    private registry: ProcessRegistry,
    private detector: OrphanDetector,
    private cleaner: ProcessCleaner,
    private spawner: ProcessSpawner
  ) {}

  /**
   * Spawn a child process and track it automatically
   *
   * Process is added to registry immediately and removed on exit.
   * Supports both standard spawn and PTY-based spawning.
   *
   * @param command - Command to execute
   * @param args - Command arguments
   * @param options - Spawn options (cwd, env, etc.)
   * @returns ChildProcess-like object (may be PTY process)
   */
  spawn(command: string, args: string[], options?: ISpawnOptions): ChildProcess {
    // Delegate to spawner
    const proc = this.spawner.spawn(command, args, {
      cwd: options?.cwd,
      env: options?.env,
      cols: 80,
      rows: 24
    })

    // Track if process started successfully
    if (proc.pid) {
      const metadata: ProcessMetadata = {
        command,
        args,
        namespace: 'loopwork',
        startTime: Date.now()
      }

      this.track(proc.pid, metadata)

      // Auto-untrack on exit
      proc.on('close', () => {
        if (proc.pid) {
          this.untrack(proc.pid)
        }
      })
    }

    // Return as ChildProcess-compatible interface
    return proc as unknown as ChildProcess
  }

  /**
   * Kill a tracked process
   *
   * Sends the specified signal to the process and updates registry.
   * Does not wait for process to terminate.
   *
   * @param pid - Process ID to kill
   * @param signal - Signal to send (default: SIGTERM)
   * @returns true if signal was sent, false if process not found
   */
  kill(pid: number, signal: NodeJS.Signals = 'SIGTERM'): boolean {
    try {
      process.kill(pid, signal)

      // Update registry status
      const info = this.registry.get(pid)
      if (info) {
        // Process is being killed, update to stopped
        this.registry.remove(pid)
      }

      return true
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
        // Process doesn't exist - remove from registry
        this.registry.remove(pid)
        return false
      }
      throw error
    }
  }

  /**
   * Track an existing process
   *
   * Useful for tracking processes spawned outside ProcessManager.
   *
   * @param pid - Process ID to track
   * @param metadata - Process metadata (command, args, namespace, etc.)
   */
  track(pid: number, metadata: ProcessMetadata): void {
    this.registry.add(pid, metadata)
  }

  /**
   * Untrack a process (when it exits normally)
   *
   * Removes process from registry but does not kill it.
   *
   * @param pid - Process ID to untrack
   */
  untrack(pid: number): void {
    this.registry.remove(pid)
  }

  /**
   * List all tracked child processes
   *
   * @returns Array of process information for all tracked processes
   */
  listChildren(): ProcessInfo[] {
    return this.registry.list()
  }

  /**
   * List processes in a specific namespace
   *
   * Namespaces are used to group related processes (e.g., 'loopwork', 'claude').
   *
   * @param namespace - Namespace to filter by
   * @returns Array of process information for processes in the namespace
   */
  listByNamespace(namespace: string): ProcessInfo[] {
    return this.registry.listByNamespace(namespace)
  }

  /**
   * Detect and clean orphan processes
   *
   * Three-stage process:
   * 1. Scan for orphans using three detection methods
   * 2. Clean orphans using graceful shutdown (SIGTERM → SIGKILL)
   * 3. Persist updated registry to disk
   *
   * @returns Detailed cleanup results with success/failure counts
   */
  async cleanup(): Promise<CleanupResult> {
    // Stage 1: Detect orphans
    const orphans = await this.detector.scan()

    // Stage 2: Clean orphans
    const result = await this.cleaner.cleanup(orphans)

    // Stage 3: Persist registry
    // Note: cleaner.cleanup() already persists, but we do it again
    // to ensure consistency if cleanup partially failed
    await this.persist()

    return result
  }

  /**
   * Persist registry to disk
   *
   * Saves current process state to enable crash recovery.
   * Uses file locking to prevent concurrent write conflicts.
   */
  async persist(): Promise<void> {
    await this.registry.persist()
  }

  /**
   * Load registry from disk
   *
   * Restores process state from previous session.
   * Used for crash recovery and resuming after restart.
   */
  async load(): Promise<void> {
    await this.registry.load()
  }
}

/**
 * Factory function to create a ProcessManager with sensible defaults
 *
 * Creates all dependencies and wires them together.
 * Provides a simple API for common use cases.
 *
 * @param options - Configuration options
 * @param options.storageDir - Directory for persisting registry (default: '.loopwork')
 * @param options.spawner - Custom ProcessSpawner (default: auto-detect PTY vs standard)
 * @param options.patterns - Process name patterns to detect as orphans (default: loopwork-related)
 * @param options.staleTimeoutMs - Process stale timeout in milliseconds (default: 300000 = 5 minutes)
 * @param options.gracePeriodMs - Grace period for SIGTERM before SIGKILL (default: 5000 = 5 seconds)
 * @returns Configured IProcessManager instance
 *
 * @example
 * ```typescript
 * // Basic usage with defaults
 * const manager = createProcessManager()
 *
 * // Custom configuration
 * const manager = createProcessManager({
 *   storageDir: '/tmp/loopwork',
 *   staleTimeoutMs: 600000, // 10 minutes
 *   gracePeriodMs: 10000    // 10 seconds
 * })
 *
 * // Spawn and track a process
 * const proc = manager.spawn('node', ['script.js'])
 *
 * // Cleanup orphans
 * const result = await manager.cleanup()
 * console.log(`Cleaned ${result.cleaned.length} orphans`)
 * ```
 */
export function createProcessManager(options?: {
  storageDir?: string
  spawner?: ProcessSpawner
  patterns?: string[]
  staleTimeoutMs?: number
  gracePeriodMs?: number
}): IProcessManager {
  const storageDir = options?.storageDir ?? '.loopwork'
  const spawner = options?.spawner ?? createSpawner()
  const patterns = options?.patterns ?? ['claude', 'opencode', 'loopwork', 'bun run']
  const staleTimeoutMs = options?.staleTimeoutMs ?? 300000 // 5 minutes
  const gracePeriodMs = options?.gracePeriodMs ?? 5000 // 5 seconds

  // Create dependencies
  const registry = new ProcessRegistry(storageDir)
  const detector = new OrphanDetector(registry, patterns, staleTimeoutMs)
  const cleaner = new ProcessCleaner(registry, gracePeriodMs)

  // Compose into ProcessManager
  return new ProcessManager(registry, detector, cleaner, spawner)
}

// Export both the class and factory function
export default ProcessManager
