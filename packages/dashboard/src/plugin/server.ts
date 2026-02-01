import type { DashboardConfig, DashboardEvent, LoopState, TaskBackend, IDashboardServer } from './types'
import { DashboardBroadcaster } from './broadcaster'
import { createRoutes } from './routes'
import { startFileWatcher, stopFileWatcher } from './file-watcher'

export class DashboardServer implements IDashboardServer {
  private config: DashboardConfig
  private broadcaster: DashboardBroadcaster
  private server?: ReturnType<typeof Bun.serve>
  private _backend?: TaskBackend
  private _currentTaskId?: string
  private _loopState: LoopState = 'stopped'
  private _loopStartTime?: number
  private _loopMetrics = {
    tasksCompleted: 0,
    tasksFailed: 0,
    iterations: 0,
  }

  constructor(config: DashboardConfig = {}) {
    this.config = config
    this.broadcaster = new DashboardBroadcaster()
  }

  set backend(backend: TaskBackend) {
    this._backend = backend
  }

  get backend(): TaskBackend | undefined {
    return this._backend
  }

  set currentTaskId(taskId: string | undefined) {
    this._currentTaskId = taskId
  }

  get currentTaskId(): string | undefined {
    return this._currentTaskId
  }

  get loopState(): LoopState {
    return this._loopState
  }

  set loopState(state: LoopState) {
    this._loopState = state
  }

  startLoop(): void {
    this._loopState = 'running'
    this._loopStartTime = Date.now()
    this.broadcast({
      type: 'state_update',
      data: { state: 'running' }
    })
  }

  stopLoop(): void {
    this._loopState = 'stopped'
    this._loopStartTime = undefined
    this.broadcast({
      type: 'state_update',
      data: { state: 'stopped' }
    })
  }

  pauseLoop(): void {
    this._loopState = 'paused'
    this.broadcast({
      type: 'state_update',
      data: { state: 'paused' }
    })
  }

  updateMetrics(metrics: { tasksCompleted?: number; tasksFailed?: number; iterations?: number }): void {
    if (metrics.tasksCompleted !== undefined) {
      this._loopMetrics.tasksCompleted = metrics.tasksCompleted
    }
    if (metrics.tasksFailed !== undefined) {
      this._loopMetrics.tasksFailed = metrics.tasksFailed
    }
    if (metrics.iterations !== undefined) {
      this._loopMetrics.iterations = metrics.iterations
    }
  }

  getMetrics() {
    const total = this._loopMetrics.tasksCompleted + this._loopMetrics.tasksFailed
    const successRate = total > 0 ? (this._loopMetrics.tasksCompleted / total) * 100 : 0
    return {
      tasksCompleted: this._loopMetrics.tasksCompleted,
      tasksFailed: this._loopMetrics.tasksFailed,
      iterations: this._loopMetrics.iterations,
      successRate: Math.round(successRate * 100) / 100,
    }
  }

  getLoopStatus() {
    const uptime = this._loopStartTime ? Math.floor((Date.now() - this._loopStartTime) / 1000) : undefined
    const startedAt = this._loopStartTime ? new Date(this._loopStartTime).toISOString() : undefined
    return {
      state: this._loopState,
      isRunning: this._loopState === 'running',
      isPaused: this._loopState === 'paused',
      uptime,
      startedAt,
      metrics: this.getMetrics(),
    }
  }

  async start(): Promise<void> {
    const host = this.config.host || 'localhost'
    const port = this.config.port || 3333

    startFileWatcher(this.broadcaster)

    const handleRequest = createRoutes(this.broadcaster, this)

    this.server = Bun.serve({
      hostname: host,
      port: port,
      fetch: async (req) => {
        const response = await handleRequest(req)
        if (response) return response

        return new Response('Not Found', { status: 404 })
      },
    })

    console.log(`[DashboardServer] Starting on http://${host}:${port}`)
  }

  async stop(): Promise<void> {
    console.log('[DashboardServer] Stopping')
    if (this.server) {
      this.server.stop()
      this.server = undefined
    }
    this.broadcaster.stop()
    await stopFileWatcher()
  }

  broadcast(event: Omit<DashboardEvent, 'timestamp' | 'namespace'> & { namespace?: string }): void {
    const fullEvent: DashboardEvent = {
      ...event,
      namespace: event.namespace || 'default',
      timestamp: new Date().toISOString(),
    }
    this.broadcaster.broadcast(fullEvent)
  }
}
