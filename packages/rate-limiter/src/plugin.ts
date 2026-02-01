import type { LoopworkPlugin, TaskContext } from '@loopwork-ai/loopwork/contracts'

import { createProviderManager } from './factories'
import { CLAUDE_LIMITS, OPENAI_LIMITS, GEMINI_LIMITS } from './providers'

export type ConfigWrapper = (config: unknown) => unknown

export function createRateLimiterPlugin(options = {}) {
  const manager = createProviderManager();
  
  manager.addProvider('claude', CLAUDE_LIMITS);
  manager.addProvider('openai', OPENAI_LIMITS);
  manager.addProvider('gemini', GEMINI_LIMITS);

  return {
    name: 'rate-limiter',
    classification: 'critical',
    async onTaskStart(context: TaskContext) {
      const provider = context.task.id.startsWith('AUTH') ? 'claude' : 'openai';
      const decision = manager.checkLimit(provider);
      
      if (!decision.allowed) {
        throw new Error(`Rate limit exceeded for ${provider}. Retry after ${decision.retryAfter}s`);
      }
    },
  } as LoopworkPlugin
}

export function withRateLimiter(options = {}): ConfigWrapper {
  return (config) => {
    const currentConfig = config as any;
    return {
      ...currentConfig,
      plugins: [...(currentConfig.plugins || []), createRateLimiterPlugin(options)],
    };
  };
}
