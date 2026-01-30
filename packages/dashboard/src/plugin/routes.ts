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

    if (url.pathname === '/health' && req.method === 'GET') {
      return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
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

    if (url.pathname === '/api/tasks' && req.method === 'GET') {
      try {
        if (!server.backend) {
          return new Response(JSON.stringify({ error: 'Backend not initialized' }), {
            status: 503,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const tasks = await server.backend.listPendingTasks()
        const completedTasks = typeof server.backend.listCompletedTasks === 'function'
          ? await server.backend.listCompletedTasks()
          : []
        const failedTasks = typeof server.backend.listFailedTasks === 'function'
          ? await server.backend.listFailedTasks()
          : []

        const allTasks = [...tasks, ...completedTasks, ...failedTasks]

        return new Response(JSON.stringify({ tasks: allTasks, total: allTasks.length }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    if (url.pathname === '/api/tasks/current' && req.method === 'GET') {
      try {
        if (!server.backend) {
          return new Response(JSON.stringify({ error: 'Backend not initialized' }), {
            status: 503,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        let currentTask = null
        if (server.currentTaskId) {
          currentTask = await server.backend.getTask(server.currentTaskId)
        }

        return new Response(JSON.stringify({ task: currentTask }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    if (url.pathname === '/api/tasks/next' && req.method === 'GET') {
      try {
        if (!server.backend) {
          return new Response(JSON.stringify({ error: 'Backend not initialized' }), {
            status: 503,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const nextTask = await server.backend.findNextTask()

        return new Response(JSON.stringify({ task: nextTask }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    if (url.pathname === '/api/tasks/completed' && req.method === 'GET') {
      try {
        if (!server.backend) {
          return new Response(JSON.stringify({ error: 'Backend not initialized' }), {
            status: 503,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const completedTasks = typeof server.backend.listCompletedTasks === 'function'
          ? await server.backend.listCompletedTasks()
          : []

        return new Response(JSON.stringify({ tasks: completedTasks, total: completedTasks.length }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    if (url.pathname === '/api/tasks/pending' && req.method === 'GET') {
      try {
        if (!server.backend) {
          return new Response(JSON.stringify({ error: 'Backend not initialized' }), {
            status: 503,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const pendingTasks = await server.backend.listPendingTasks()

        return new Response(JSON.stringify({ tasks: pendingTasks, total: pendingTasks.length }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    if (url.pathname === '/api/tasks/stats' && req.method === 'GET') {
      try {
        if (!server.backend) {
          return new Response(JSON.stringify({ error: 'Backend not initialized' }), {
            status: 503,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const pendingTasks = await server.backend.listPendingTasks()
        const completedTasks = typeof server.backend.listCompletedTasks === 'function'
          ? await server.backend.listCompletedTasks()
          : []
        const failedTasks = typeof server.backend.listFailedTasks === 'function'
          ? await server.backend.listFailedTasks()
          : []

        const pending = pendingTasks.length
        const completed = completedTasks.length
        const failed = failedTasks.length
        const inProgress = server.currentTaskId ? 1 : 0
        const total = pending + completed + failed + inProgress
        const successRate = total > 0 ? (completed / total) * 100 : 0

        return new Response(JSON.stringify({
          total,
          pending,
          inProgress,
          completed,
          failed,
          successRate: Math.round(successRate * 100) / 100,
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    return undefined
  }
}
