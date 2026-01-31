import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import { authMiddleware } from '../src/middleware/auth'
import type { HonoEnv } from '../src/types'

describe('Auth Middleware - Health Check', () => {
  it('should allow public access to /health even when auth is enabled', async () => {
    const app = new Hono<HonoEnv>()
    const config = {
      apiKeys: [{ key: 'secret-key', name: 'Admin' }]
    }
    
    app.use('/*', authMiddleware(config))
    app.get('/health', (c) => c.json({ status: 'ok' }))

    const res = await app.request('/health')
    
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual({ status: 'ok' })
  })
})
