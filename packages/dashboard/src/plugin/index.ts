import type { LoopworkPlugin, ConfigWrapper } from '@loopwork-ai/loopwork/contracts'
import { DashboardServer } from './server'
import type { DashboardConfig } from './types'

export function createDashboardPlugin(config: DashboardConfig = {}): LoopworkPlugin {
  const server = new DashboardServer(config)

  return {
    name: 'dashboard',

    async onConfigLoad(loopworkConfig) {
      if (config.enabled !== false) {
        await server.start()
      }
      return loopworkConfig
    },

    async onBackendReady(backend) {
      server.backend = backend
    },

    async onLoopStart(namespace) {
      server.broadcast({ type: 'loop_start', namespace })
    },

    async onTaskStart(context) {
      server.broadcast({ 
        type: 'task_start', 
        data: context.task 
      })
    },

    async onTaskComplete(context, result) {
      server.broadcast({ 
        type: 'task_complete', 
        data: { task: context.task, result } 
      })
    },

    async onTaskFailed(context, error) {
      server.broadcast({ 
        type: 'task_failed', 
        data: { task: context.task, error } 
      })
    },

    async onLoopEnd(stats) {
      server.broadcast({ type: 'loop_end', data: stats })
      await server.stop()
    }
  }
}

export function withDashboard(config: DashboardConfig = {}): ConfigWrapper {
  return (loopworkConfig) => ({
    ...loopworkConfig,
    plugins: [...(loopworkConfig.plugins || []), createDashboardPlugin(config)],
  })
}
