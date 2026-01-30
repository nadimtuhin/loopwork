import type { DashboardConfig, DashboardEvent } from './types'
import { DashboardBroadcaster } from './broadcaster'
import { createRoutes } from './routes'
import { startFileWatcher, stopFileWatcher } from './file-watcher'

// Minimal TaskBackend interface for dashboard needs
interface TaskBackend {
  listPendingTasks(): Promise<any[]>
  findNextTask(): Promise<any | null>
  getTask(id: string): Promise<any | null>
  createTask?(input: any): Promise<any>
  listCompletedTasks?(): Promise<any[]>
  listFailedTasks?(): Promise<any[]>
}

export class DashboardServer {
  private config: DashboardConfig
  private broadcaster: DashboardBroadcaster
  private server?: ReturnType<typeof Bun.serve>
  private _backend?: TaskBackend
  private _currentTaskId?: string

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
