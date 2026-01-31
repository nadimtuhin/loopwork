import { createMiddleware } from 'hono/factory'
import type { HonoEnv } from '../types'

interface RateLimitState {
  count: number
  resetAt: number
}

const stores = new Map<string, RateLimitState>()

export const rateLimitMiddleware = () => createMiddleware<HonoEnv>(async (c, next) => {
  const identity = c.get('identity')
  if (!identity) {
    return await next()
  }

  // Use identity's specific rate limit or a default one from config if available
  // For simplicity here, we'll look for identity.rateLimit
  const limit = identity.rateLimit || { windowMs: 60000, max: 100 }
  const key = `${identity.type}:${identity.id}`
  
  const now = Date.now()
  let state = stores.get(key)

  if (!state || now > state.resetAt) {
    state = {
      count: 0,
      resetAt: now + limit.windowMs
    }
    stores.set(key, state)
  }

  state.count++

  c.header('X-RateLimit-Limit', limit.max.toString())
  c.header('X-RateLimit-Remaining', Math.max(0, limit.max - state.count).toString())
  c.header('X-RateLimit-Reset', Math.ceil(state.resetAt / 1000).toString())

  if (state.count > limit.max) {
    return c.json({ error: 'Too Many Requests' }, 429)
  }

  await next()
})
