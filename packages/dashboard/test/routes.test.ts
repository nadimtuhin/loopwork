import { describe, test, expect, beforeEach } from 'bun:test'
import { createRoutes } from '../src/plugin/routes'

describe('Dashboard Routes', () => {
  let handleRequest: (req: Request) => Promise<Response | undefined>
  let mockBroadcaster: any
  let mockServer: any

  beforeEach(() => {
    mockBroadcaster = {
      addClient: () => new Response('mock SSE'),
    }
    mockServer = {
      backend: null,
    }
    handleRequest = createRoutes(mockBroadcaster, mockServer)
  })

  describe('GET /health', () => {
    test('returns 200 status code', async () => {
      const request = new Request('http://localhost:3333/health', {
        method: 'GET',
      })
      const response = await handleRequest(request)

      expect(response).toBeDefined()
      expect(response?.status).toBe(200)
    })

    test('returns JSON with status and timestamp', async () => {
      const request = new Request('http://localhost:3333/health', {
        method: 'GET',
      })
      const response = await handleRequest(request)

      expect(response).toBeDefined()
      const contentType = response?.headers.get('Content-Type')
      expect(contentType).toBe('application/json')

      const data = await response?.json()
      expect(data).toHaveProperty('status')
      expect(data.status).toBe('ok')
      expect(data).toHaveProperty('timestamp')
    })

    test('timestamp is in ISO format', async () => {
      const request = new Request('http://localhost:3333/health', {
        method: 'GET',
      })
      const response = await handleRequest(request)

      expect(response).toBeDefined()
      const data = await response?.json()

      // Validate ISO timestamp format
      const timestamp = new Date(data.timestamp)
      expect(timestamp.toISOString()).toBe(data.timestamp)

      // Verify it's a recent timestamp (within last 5 seconds)
      const now = Date.now()
      const timestampMs = timestamp.getTime()
      expect(now - timestampMs).toBeLessThan(5000)
    })

    test('includes CORS headers', async () => {
      const request = new Request('http://localhost:3333/health', {
        method: 'GET',
      })
      const response = await handleRequest(request)

      expect(response).toBeDefined()
      expect(response?.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(response?.headers.get('Access-Control-Allow-Methods')).toContain('GET')
    })

    test('responds to OPTIONS preflight request', async () => {
      const request = new Request('http://localhost:3333/health', {
        method: 'OPTIONS',
      })
      const response = await handleRequest(request)

      expect(response).toBeDefined()
      expect(response?.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })

    test('response time is under 100ms', async () => {
      const start = Date.now()

      const request = new Request('http://localhost:3333/health', {
        method: 'GET',
      })
      await handleRequest(request)

      const duration = Date.now() - start
      expect(duration).toBeLessThan(100)
    })

    test('does not require authentication', async () => {
      // No Authorization header
      const request = new Request('http://localhost:3333/health', {
        method: 'GET',
      })
      const response = await handleRequest(request)

      expect(response).toBeDefined()
      expect(response?.status).toBe(200)
    })

    test('ignores non-GET methods', async () => {
      const request = new Request('http://localhost:3333/health', {
        method: 'POST',
      })
      const response = await handleRequest(request)

      // Should return undefined (not handled by /health endpoint)
      // Will be handled by server's 404 handler
      expect(response).toBeUndefined()
    })
  })
})
