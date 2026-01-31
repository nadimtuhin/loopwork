import { createMiddleware } from 'hono/factory'
import { logger } from '@loopwork-ai/loopwork'
import type { HonoEnv } from '../types'

export const auditMiddleware = () => createMiddleware<HonoEnv>(async (c, next) => {
  const identity = c.get('identity')
  if (identity) {
    const method = c.req.method
    const path = c.req.path
    const id = identity.id
    const type = identity.type
    
    await next()
    
    logger.info(`[AUDIT] ${id} (${type}) - ${method} ${path} - Status: ${c.res.status}`)
  } else {
    await next()
  }
})
