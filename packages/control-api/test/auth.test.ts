import { describe, expect, it, beforeEach, spyOn, mock } from 'bun:test'
import { Hono } from 'hono'
import { authMiddleware } from '../src/middleware/auth'
import { rateLimitMiddleware } from '../src/middleware/rate-limit'
import { auditMiddleware } from '../src/middleware/audit'
import { logger } from '@loopwork-ai/loopwork'
import type { HonoEnv } from '../src/types'
import { sign, verify } from 'hono/jwt'

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

  it('should support JWT token refresh', async () => {
    const secret = 'test-secret'
    const refreshSecret = 'refresh-secret'
    const context = {
      config: {
        auth: {
          jwt: { secret, refreshSecret }
        }
      }
    }
    
    const { ControlServer } = await import('../src/server')
    const server = new ControlServer(context as any)
    const app = server['app']

    const refreshToken = await sign({ sub: 'user123' }, refreshSecret, 'HS256')
    
    const res = await app.request('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
      headers: { 'Content-Type': 'application/json' }
    })
    
    expect(res.status).toBe(200)
    const data = await res.json() as { token: string }
    expect(data.token).toBeDefined()
    
    const payload = await verify(data.token, secret, 'HS256')
    expect(payload.sub).toBe('user123')
  })

  it('should log authenticated requests', async () => {
    const app = new Hono<HonoEnv>()
    const config = {
      apiKeys: [{ key: 'audit-key', name: 'Audit User' }]
    }
    
    const loggerSpy = spyOn(logger, 'info')
    
    app.use('/*', authMiddleware(config))
    app.use('/*', auditMiddleware())
    app.get('/audit-test', (c) => c.json({ ok: true }))

    const res = await app.request('/audit-test', {
      headers: { 'X-API-Key': 'audit-key' }
    })
    
    expect(res.status).toBe(200)
    expect(loggerSpy).toHaveBeenCalled()
    expect(loggerSpy.mock.calls[0][0]).toContain('[AUDIT] audit-key (api-key) - GET /audit-test')
    
    loggerSpy.mockRestore()
  })
})
