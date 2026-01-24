import type { DashboardBroadcaster } from './broadcaster'

export function createRoutes(broadcaster: DashboardBroadcaster) {
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
