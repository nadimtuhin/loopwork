import type { LoopworkPlugin, ConfigWrapper } from 'loopwork/contracts'
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

    async onLoopStart(namespace) {
      server.broadcast({ type: 'loop_start', namespace })
    },

    async onTaskStart(task) {
      server.broadcast({ 
        type: 'task_start', 
        data: task 
      })
    },

    async onTaskComplete(task, result) {
      server.broadcast({ 
        type: 'task_complete', 
        data: { task, result } 
      })
    },

    async onTaskFailed(task, error) {
      server.broadcast({ 
        type: 'task_failed', 
        data: { task, error } 
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
