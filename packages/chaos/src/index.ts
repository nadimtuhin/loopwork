import type { LoopworkPlugin, ConfigWrapper, TaskContext } from '@loopwork-ai/loopwork/contracts'
import { ApiSimulator, NetworkChaosConfig, ApiEndpointConfig } from './api-simulator'

export interface ChaosOptions {
  enabled?: boolean
  errorProbability?: number
  delayProbability?: number
  minDelay?: number
  maxDelay?: number
  errorMessage?: string
  networkChaos?: NetworkChaosConfig
  mockEndpoints?: ApiEndpointConfig[]
}

export type { NetworkChaosConfig, ApiEndpointConfig }
export { ApiSimulator }
export * from './network-interceptor'

export function createChaosPlugin(options: ChaosOptions = {}): LoopworkPlugin {
  const {
    errorProbability = 0,
    delayProbability = 0,
    minDelay = 1000,
    maxDelay = 5000,
    errorMessage = 'Chaos Monkey strikes! Artificial failure introduced by chaos plugin.',
    networkChaos,
    mockEndpoints,
  } = options

  let apiSimulator: ApiSimulator | null = null
  let networkChaosRuleIds: string[] = []

  return {
    name: 'chaos',
    classification: 'enhancement',
    
    async onTaskStart(context: TaskContext) {
      // Initialize API simulator if network chaos or mock endpoints are configured
      if ((networkChaos?.enabled || mockEndpoints?.length) && !apiSimulator) {
        apiSimulator = new ApiSimulator()
        apiSimulator.start()

        // Apply network chaos configuration
        if (networkChaos?.enabled) {
          networkChaosRuleIds = apiSimulator.applyNetworkChaos(networkChaos)
        }

        // Configure mock endpoints
        if (mockEndpoints?.length) {
          for (const endpoint of mockEndpoints) {
            apiSimulator.mockEndpoint(endpoint)
          }
        }
      }

      // Apply task-level delay
      if (delayProbability > 0 && Math.random() < delayProbability) {
        const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay
        await new Promise(resolve => setTimeout(resolve, delay))
      }

      // Apply task-level error
      if (errorProbability > 0 && Math.random() < errorProbability) {
        throw new Error(errorMessage)
      }
    },

    async onTaskComplete() {
      // Clean up network chaos rules after task completes
      if (apiSimulator && networkChaosRuleIds.length > 0) {
        apiSimulator.clearAll()
        networkChaosRuleIds = []
      }
    },

    async onTaskFailed() {
      // Clean up on failure too
      if (apiSimulator && networkChaosRuleIds.length > 0) {
        apiSimulator.clearAll()
        networkChaosRuleIds = []
      }
    },

    async onLoopEnd() {
      // Stop the API simulator when loop ends
      if (apiSimulator) {
        apiSimulator.stop()
        apiSimulator = null
      }
    },
  }
}

type ConfigWithPlugins = {
  plugins?: unknown[]
}

export function withChaos(options: ChaosOptions = {}): ConfigWrapper {
  const { enabled = true } = options
  
  return (config: unknown) => {
    if (!enabled) return config
    
    const cfg = config as ConfigWithPlugins
    const plugins = Array.isArray(cfg.plugins) ? cfg.plugins : []
    
    return {
      ...cfg,
      plugins: [...plugins, createChaosPlugin(options)],
    }
  }
}
