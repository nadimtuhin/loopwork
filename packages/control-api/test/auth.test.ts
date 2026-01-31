import { describe, expect, it, beforeEach } from 'bun:test'
import { Hono } from 'hono'
import { authMiddleware } from '../src/middleware/auth'
import { rateLimitMiddleware } from '../src/middleware/rate-limit'
import type { HonoEnv } from '../src/types'
import { sign } from 'hono/jwt'

describe('Auth Middleware', () => {
  it('should allow request with valid API key', async () => {
    const app = new Hono<HonoEnv>()
    const config = {
      apiKeys: [{ key: 'test-key', name: 'Test User' }]
    }
    
    app.use('/*', authMiddleware(config))
    app.get('/test', (c) => c.json({ ok: true }))

    const res = await app.request('/test', {
      headers: { 'X-API-Key': 'test-key' }
    })
    
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('should reject request with invalid API key', async () => {
    const app = new Hono<HonoEnv>()
    const config = {
      apiKeys: ['valid-key']
    }
    
    app.use('/*', authMiddleware(config))
    app.get('/test', (c) => c.json({ ok: true }))

    const res = await app.request('/test', {
      headers: { 'X-API-Key': 'invalid-key' }
    })
    
    expect(res.status).toBe(401)
  })

  it('should allow request with valid JWT', async () => {
    const app = new Hono<HonoEnv>()
    const secret = 'test-secret'
    const config = {
      jwt: { secret }
    }
    
    const token = await sign({ sub: 'user123', name: 'John' }, secret, 'HS256')
    
    app.use('/*', authMiddleware(config))
    app.get('/test', (c) => c.json({ ok: true }))

    const res = await app.request('/test', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    
    expect(res.status).toBe(200)
  })

  it('should apply rate limiting', async () => {
    const app = new Hono<HonoEnv>()
    const config = {
      apiKeys: [{ key: 'test-key', name: 'Test User', rateLimit: { windowMs: 1000, max: 2 } }]
    }
    
    app.use('/*', authMiddleware(config))
    app.use('/*', rateLimitMiddleware())
    app.get('/test', (c) => c.json({ ok: true }))

    // First request
    let res = await app.request('/test', { headers: { 'X-API-Key': 'test-key' } })
    expect(res.status).toBe(200)

    // Second request
    res = await app.request('/test', { headers: { 'X-API-Key': 'test-key' } })
    expect(res.status).toBe(200)

    // Third request (should be rate limited)
    res = await app.request('/test', { headers: { 'X-API-Key': 'test-key' } })
    expect(res.status).toBe(429)
  })
})
