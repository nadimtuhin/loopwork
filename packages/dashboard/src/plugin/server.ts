import type { Server } from 'bun'
import type { DashboardConfig, DashboardEvent } from './types'
import { DashboardBroadcaster } from './broadcaster'
import { createRoutes } from './routes'
import { startFileWatcher, stopFileWatcher } from './file-watcher'

export class DashboardServer {
  private config: DashboardConfig
  private broadcaster: DashboardBroadcaster
  private server?: Server

  constructor(config: DashboardConfig = {}) {
    this.config = config
    this.broadcaster = new DashboardBroadcaster()
  }

  async start(): Promise<void> {
    const host = this.config.host || 'localhost'
    const port = this.config.port || 3333

    startFileWatcher(this.broadcaster)

    const handleRequest = createRoutes(this.broadcaster)

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
