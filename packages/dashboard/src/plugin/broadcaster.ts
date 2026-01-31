
import type { DashboardEvent } from './types'

export class DashboardBroadcaster {
  private clients: Map<ReadableStreamDefaultController, Set<string> | null> = new Map()
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null

  constructor(private heartbeatIntervalMs: number = 30000) {
    this.startHeartbeat()
  }

  addClient(req: Request): Response {
    let currentController: ReadableStreamDefaultController

    // Parse query params for filtering
    const url = new URL(req.url)
    const eventsParam = url.searchParams.get('events')
    const filter = eventsParam ? new Set(eventsParam.split(',')) : null

    const stream = new ReadableStream({
      start: (controller) => {
        currentController = controller
        this.clients.set(controller, filter)
        
        // Send initial connection confirmation
        const encoder = new TextEncoder()
        controller.enqueue(encoder.encode(`: connected\n\n`))
      },
      cancel: () => {
        this.clients.delete(currentController)
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }

  broadcast(event: DashboardEvent): void {
    const data = `data: ${JSON.stringify(event)}\n\n`
    const encoder = new TextEncoder()
    const encoded = encoder.encode(data)

    for (const [client, filter] of this.clients.entries()) {
      // Check if client filters this event type
      if (filter && !filter.has(event.type)) {
        continue
      }

      try {
        client.enqueue(encoded)
      } catch (err) {
        this.clients.delete(client)
      }
    }
  }

  private startHeartbeat() {
    if (this.heartbeatInterval) return

    this.heartbeatInterval = setInterval(() => {
      this.broadcastHeartbeat()
    }, this.heartbeatIntervalMs)
  }

  private broadcastHeartbeat() {
    const data = `: heartbeat\n\n`
    const encoder = new TextEncoder()
    const encoded = encoder.encode(data)

    for (const client of this.clients.keys()) {
      try {
        client.enqueue(encoded)
      } catch (err) {
        this.clients.delete(client)
      }
    }
  }

  stop() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }
}
