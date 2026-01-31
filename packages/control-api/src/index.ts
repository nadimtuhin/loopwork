import type { LoopworkPlugin, TaskBackend, LoopworkConfig, ConfigWrapper } from '@loopwork-ai/loopwork/contracts'
import { ControlServer } from './server'
import type { ControlApiConfig, ControlApiContext } from './types'

export function withControlApi(config: ControlApiConfig = {}): ConfigWrapper {
  return (loopworkConfig: LoopworkConfig) => ({
    ...loopworkConfig,
    plugins: [...(loopworkConfig.plugins || []), createControlApi(config)]
  })
}

export function createControlApi(config: ControlApiConfig = {}): LoopworkPlugin {
  let server: ControlServer | undefined
  const context: ControlApiContext = { config }
  
  const options = {
    port: config.port || 3333,
    host: config.host || 'localhost',
    enabled: config.enabled !== false, // default true
    prefix: config.prefix || '/api/v1'
  }

  return {
    name: 'control-api',

    onBackendReady(backend: TaskBackend) {
      if (!options.enabled) return
      
      context.backend = backend
      server = new ControlServer(context)
      // Server will be started in onLoopStart or here? 
      // Starting here ensures API is available even if loop hasn't started (e.g. if we have a manual start trigger)
      // But typically plugins start services when loop starts or just initialize them.
      // Let's start it here so we can control the loop BEFORE it starts (if we implement loop control)
      server.start(options.port, options.host)
    },

    onLoopStart(namespace: string) {
      if (server) {
        context.namespace = namespace
        server.updateContext({ namespace })
      }
    },

    onTaskStart(taskContext) {
      if (server) {
        context.currentTaskId = taskContext.task.id
        server.updateContext({ currentTaskId: taskContext.task.id })
      }
    },

    onTaskComplete() {
      if (server) {
        context.currentTaskId = undefined
        server.updateContext({ currentTaskId: undefined })
      }
    },

    onTaskFailed() {
      if (server) {
        context.currentTaskId = undefined
        server.updateContext({ currentTaskId: undefined })
      }
    },

    onLoopEnd() {
      if (server) {
        server.stop()
      }
    }
  }
}
