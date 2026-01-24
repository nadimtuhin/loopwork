import type { DashboardEvent } from './types'

export class DashboardBroadcaster {
  private clients: Set<ReadableStreamDefaultController> = new Set()

  addClient(_req: Request): Response {
    let currentController: ReadableStreamDefaultController

    const stream = new ReadableStream({
      start: (controller) => {
        currentController = controller
        this.clients.add(controller)
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

    for (const client of this.clients) {
      try {
        client.enqueue(encoded)
      } catch (err) {
        this.clients.delete(client)
      }
    }
  }
}
