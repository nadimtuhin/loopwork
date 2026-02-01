import type { LoopworkPlugin, ConfigWrapper, TaskContext } from '@loopwork-ai/loopwork/contracts'

export interface ChaosOptions {
  enabled?: boolean
  errorProbability?: number
  delayProbability?: number
  minDelay?: number
  maxDelay?: number
  errorMessage?: string
}

export function createChaosPlugin(options: ChaosOptions = {}): LoopworkPlugin {
  const {
    errorProbability = 0,
    delayProbability = 0,
    minDelay = 1000,
    maxDelay = 5000,
    errorMessage = 'Chaos Monkey strikes! Artificial failure introduced by chaos plugin.',
  } = options

  return {
    name: 'chaos',
    classification: 'enhancement',
    
    async onTaskStart(context: TaskContext) {
      if (delayProbability > 0 && Math.random() < delayProbability) {
        const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay
        await new Promise(resolve => setTimeout(resolve, delay))
      }

      if (errorProbability > 0 && Math.random() < errorProbability) {
        throw new Error(errorMessage)
      }
    },
  }
}

export function withChaos(options: ChaosOptions = {}): ConfigWrapper {
  const { enabled = true } = options
  
  return (config) => {
    if (!enabled) return config
    
    return {
      ...config,
      plugins: [...(config.plugins || []), createChaosPlugin(options)],
    }
  }
}
