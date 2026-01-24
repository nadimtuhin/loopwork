import type { DashboardBroadcaster } from './broadcaster'
import type { DashboardServer } from './server'

export function createRoutes(broadcaster: DashboardBroadcaster, server: DashboardServer) {
  return async (req: Request): Promise<Response | undefined> => {
    const url = new URL(req.url)
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders,
      })
    }

    if (url.pathname === '/api/tasks' && req.method === 'POST') {
      try {
        const body = await req.json()
        const { title, description, priority, feature, metadata } = body

        if (!title) {
          return new Response(JSON.stringify({ error: 'Title is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        if (!server.backend) {
          return new Response(JSON.stringify({ error: 'Backend not initialized' }), {
            status: 503,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        if (typeof server.backend.createTask !== 'function') {
          return new Response(JSON.stringify({ error: 'Backend does not support task creation' }), {
            status: 501,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const task = await server.backend.createTask({
          title,
          description: description || '',
          priority: priority || 'medium',
          feature,
          metadata: metadata || {},
        })

        return new Response(JSON.stringify({ success: true, task }), {
          status: 201,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    if (url.pathname === '/api/status') {
      return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      })
    }

    if (url.pathname === '/api/events') {
      return broadcaster.addClient(req)
    }

    if (url.pathname === '/api/namespaces') {
      return new Response(JSON.stringify({ namespaces: ['default'] }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      })
    }

    return undefined
  }
}
