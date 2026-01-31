import { createMiddleware } from 'hono/factory'
import { verify } from 'hono/jwt'
import type { ControlApiAuthConfig } from '../types'

export const authMiddleware = (config?: ControlApiAuthConfig) => createMiddleware(async (c, next) => {
  if (!config) {
    return await next()
  }

  const apiKeyHeader = c.req.header('X-API-Key')
  const authHeader = c.req.header('Authorization')

  if (apiKeyHeader && config.apiKeys) {
    const validKey = config.apiKeys.find(k => {
      const keyStr = typeof k === 'string' ? k : k.key
      return keyStr === apiKeyHeader
    })

    if (validKey) {
      const identity = typeof validKey === 'string' 
        ? { id: apiKeyHeader, name: 'API Key', type: 'api-key' } 
        : { id: validKey.key, name: validKey.name, type: 'api-key', rateLimit: validKey.rateLimit }
      
      c.set('identity', identity)
      return await next()
    }
  }

  if (authHeader?.startsWith('Bearer ') && config.jwt) {
    try {
      const token = authHeader.split(' ')[1]
      const payload = await verify(token, config.jwt.secret, 'HS256')
      
      if (payload) {
        if (config.jwt.issuer && payload.iss !== config.jwt.issuer) {
          throw new Error('Invalid issuer')
        }
        if (config.jwt.audience && payload.aud !== config.jwt.audience) {
          throw new Error('Invalid audience')
        }

        c.set('identity', { 
          id: payload.sub || 'unknown', 
          name: payload.name || payload.sub || 'JWT User',
          type: 'jwt',
          payload 
        })
        return await next()
      }
    } catch (e) {
      return c.json({ error: 'Invalid or expired token' }, 401)
    }
  }

  if (config.apiKeys || config.jwt) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  return await next()
})
