import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from '@loopwork-ai/loopwork'
import { authMiddleware } from './middleware/auth'
import { rateLimitMiddleware } from './middleware/rate-limit'
import { auditMiddleware } from './middleware/audit'
import { sign, verify } from 'hono/jwt'
import { TaskBackend, FindTaskOptions } from '@loopwork-ai/loopwork/contracts'
import type { ControlApiContext, HonoEnv } from './types'

export class ControlServer {
  private app: Hono<HonoEnv>
  private backend?: TaskBackend
  private server?: any // Bun server instance

  constructor(private context: ControlApiContext) {
    this.app = new Hono<HonoEnv>()
    this.backend = context.backend
    this.setupMiddleware()
    this.setupRoutes()
  }

  updateContext(context: Partial<ControlApiContext>) {
    if (context.backend) this.backend = context.backend
    this.context = { ...this.context, ...context }
  }

  private setupMiddleware() {
    this.app.use('/*', cors())
    this.app.use('/*', authMiddleware(this.context.config?.auth))
    this.app.use('/*', rateLimitMiddleware())
    this.app.use('/*', auditMiddleware())
  }

  private setupRoutes() {
    this.app.get('/health', (c) => {
      return c.json({ status: 'ok', timestamp: new Date().toISOString() })
    })

    this.app.post('/loop/start', async (c) => {
      return c.json({ message: 'Loop start triggered' })
    })

    this.app.post('/loop/stop', async (c) => {
      return c.json({ message: 'Loop stop triggered' })
    })

    this.app.post('/auth/refresh', async (c) => {
      let body
      try {
        body = await c.req.json()
      } catch (e) {
        return c.json({ error: 'Invalid JSON body' }, 400)
      }
      
      const { refreshToken } = body
      const config = this.context.config?.auth?.jwt
      if (!config?.refreshSecret) {
        return c.json({ error: 'Refresh tokens not configured' }, 400)
      }

      try {
        const payload = await verify(refreshToken, config.refreshSecret, 'HS256')
        const newToken = await sign({
          sub: payload.sub,
          name: payload.name,
          exp: Math.floor(Date.now() / 1000) + (config.expiresIn || 3600)
        }, config.secret, 'HS256')

        return c.json({ token: newToken })
      } catch (e: any) {
        logger.error(`[AUTH] Refresh failed: ${e.message}`)
        return c.json({ error: 'Invalid refresh token' }, 401)
      }
    })

    this.app.get('/tasks', async (c) => {
      if (!this.backend) {
        return c.json({ error: 'Backend not initialized' }, 503)
      }

      const status = c.req.query('status')
      const priority = c.req.query('priority') as any
      const feature = c.req.query('feature')
      const sort = c.req.query('sort')
      const order = c.req.query('order') || 'asc'
      const limit = parseInt(c.req.query('limit') || '50')
      const offset = parseInt(c.req.query('offset') || '0')

      const options: FindTaskOptions = {}
      if (status) options.status = status.split(',') as any
      if (priority) options.priority = priority
      if (feature) options.feature = feature

      try {
        // Since listTasks returns all matching tasks, we slice for pagination here
        // Ideally backend should support pagination for efficiency
        let allTasks = await this.backend.listTasks(options)

        if (sort) {
          allTasks.sort((a, b) => {
            let valA: any = a[sort as keyof typeof a]
            let valB: any = b[sort as keyof typeof b]

            if (sort === 'createdAt') {
              valA = a.timestamps?.createdAt
              valB = b.timestamps?.createdAt
            } else if (sort === 'priority') {
              const weights: Record<string, number> = {
                high: 4,
                medium: 3,
                low: 2,
                background: 1
              }
              valA = weights[a.priority] || 0
              valB = weights[b.priority] || 0
            }

            if (!valA) return 1
            if (!valB) return -1
            
            if (valA < valB) return order === 'asc' ? -1 : 1
            if (valA > valB) return order === 'asc' ? 1 : -1
            return 0
          })
        }

        const total = allTasks.length
        const tasks = allTasks.slice(offset, offset + limit)

        return c.json({
          data: tasks,
          meta: {
            total,
            limit,
            offset,
          }
        })
      } catch (error: any) {
        return c.json({ error: error.message }, 500)
      }
    })

    this.app.get('/tasks/:id', async (c) => {
      if (!this.backend) {
        return c.json({ error: 'Backend not initialized' }, 503)
      }

      const id = c.req.param('id')
      try {
        const task = await this.backend.getTask(id)
        if (!task) {
          return c.json({ error: 'Task not found' }, 404)
        }
        return c.json({ data: task })
      } catch (error: any) {
        return c.json({ error: error.message }, 500)
      }
    })
  }

  start(port: number = 3000, host: string = 'localhost') {
    this.server = Bun.serve({
      port,
      hostname: host,
      fetch: this.app.fetch,
    })
    console.log(`Control API listening on http://${host}:${port}`)
    return this.server
  }

  stop() {
    if (this.server) {
      this.server.stop()
      this.server = undefined
    }
  }
}
