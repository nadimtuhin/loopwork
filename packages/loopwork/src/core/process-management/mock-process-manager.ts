import type { ChildProcess, SpawnOptions } from 'child_process'
import { EventEmitter } from 'events'
import type {
  IProcessManager,
  ProcessMetadata,
  ProcessInfo,
  CleanupResult,
} from '../../contracts/process-manager'

/**
 * Mock ChildProcess for testing
 *
 * Simulates a real ChildProcess with minimal functionality:
 * - pid property
 * - stdin/stdout/stderr streams (null by default)
 * - Event emitter for 'close', 'exit', etc.
 * - kill() method
 */
class MockChildProcess extends EventEmitter {
  public pid: number
  public stdin = null
  public stdout = null
  public stderr = null
  public killed = false
  public exitCode: number | null = null
  public signalCode: NodeJS.Signals | null = null

  constructor(pid: number) {
    super()
    this.pid = pid
  }

  kill(signal?: NodeJS.Signals): boolean {
    this.killed = true
    this.signalCode = signal ?? 'SIGTERM'
    this.exitCode = signal === 'SIGKILL' ? 137 : 143

    // Emit close event after a tick
    setImmediate(() => {
      this.emit('close', this.exitCode, this.signalCode)
    })

    return true
  }
}

/**
 * MockProcessManager for testing
 *
 * Implements IProcessManager interface with in-memory tracking.
 * No real processes are spawned - returns mock ChildProcess objects.
 *
 * Features:
 * - Tracks all method calls for verification
 * - Auto-increments PIDs starting from 10000
 * - Simulates process lifecycle (spawn → track → exit → untrack)
 * - In-memory storage (no persistence)
 *
 * Usage in tests:
 * ```typescript
 * const mockManager = new MockProcessManager()
 * const proc = mockManager.spawn('node', ['script.js'])
 * expect(mockManager.spawnCalls).toHaveLength(1)
 * expect(mockManager.listChildren()).toContainEqual(
 *   expect.objectContaining({ pid: proc.pid })
 * )
 * ```
 */
export class MockProcessManager implements IProcessManager {
  private processes: Map<number, ProcessInfo> = new Map()
  private nextPid = 10000

  // Method call tracking for test verification
  public spawnCalls: Array<{ command: string; args: string[]; options?: SpawnOptions }> = []
  public killCalls: Array<{ pid: number; signal?: NodeJS.Signals }> = []
  public trackCalls: Array<{ pid: number; metadata: ProcessMetadata }> = []
  public untrackCalls: Array<{ pid: number }> = []
  public cleanupCalls: number = 0
  public persistCalls: number = 0
  public loadCalls: number = 0

  /**
   * Spawn a mock child process
   */
  spawn(command: string, args: string[], options?: SpawnOptions): ChildProcess {
    this.spawnCalls.push({ command, args, options })

    const pid = this.nextPid++
    const mockProc = new MockChildProcess(pid)

    // Track the process
    const metadata: ProcessMetadata = {
      command,
      args,
      namespace: 'test',
      startTime: Date.now()
    }
    this.track(pid, metadata)

    // Auto-untrack on close
    mockProc.on('close', () => {
      this.untrack(pid)
    })

    return mockProc as unknown as ChildProcess
  }

  /**
   * Kill a tracked process
   */
  kill(pid: number, signal: NodeJS.Signals = 'SIGTERM'): boolean {
    this.killCalls.push({ pid, signal })

    const info = this.processes.get(pid)
    if (!info) {
      return false
    }

    // Update status and remove
    this.processes.delete(pid)
    return true
  }

  /**
   * Track a process
   */
  track(pid: number, metadata: ProcessMetadata): void {
    this.trackCalls.push({ pid, metadata })

    const info: ProcessInfo = {
      ...metadata,
      pid,
      status: 'running'
    }
    this.processes.set(pid, info)
  }

  /**
   * Untrack a process
   */
  untrack(pid: number): void {
    this.untrackCalls.push({ pid })
    this.processes.delete(pid)
  }

  /**
   * List all tracked processes
   */
  listChildren(): ProcessInfo[] {
    return Array.from(this.processes.values())
  }

  /**
   * List processes by namespace
   */
  listByNamespace(namespace: string): ProcessInfo[] {
    return Array.from(this.processes.values()).filter(
      p => p.namespace === namespace
    )
  }

  /**
   * Mock cleanup - removes all processes
   */
  async cleanup(): Promise<CleanupResult> {
    this.cleanupCalls++

    const cleaned: number[] = []
    const failed: number[] = []
    const errors: Array<{ pid: number; error: string }> = []

    for (const pid of this.processes.keys()) {
      try {
        this.kill(pid, 'SIGTERM')
        cleaned.push(pid)
      } catch (error: unknown) {
        failed.push(pid)
        errors.push({ pid, error: (error as Error).message })
      }
    }

    return { cleaned, failed: errors, alreadyGone: [] }
  }

  /**
   * Mock persist - no-op in tests
   */
  async persist(): Promise<void> {
    this.persistCalls++
  }

  /**
   * Mock load - no-op in tests
   */
  async load(): Promise<void> {
    this.loadCalls++
  }

  /**
   * Reset all state - useful for test cleanup
   */
  reset(): void {
    this.processes.clear()
    this.spawnCalls = []
    this.killCalls = []
    this.trackCalls = []
    this.untrackCalls = []
    this.cleanupCalls = 0
    this.persistCalls = 0
    this.loadCalls = 0
    this.nextPid = 10000
  }
}
