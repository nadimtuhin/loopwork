import type { ICliStrategy, ICliStrategyContext, ICliPrepareResult } from '@loopwork-ai/contracts'

export class DroidStrategy implements ICliStrategy {
  readonly cliType = 'droid' as const

  prepare(context: ICliStrategyContext): ICliPrepareResult {
    const { modelConfig, prompt, env } = context
    const modelName = modelConfig.displayName || modelConfig.name
    const displayName = `droid/${modelName}`

    const args = ['exec', prompt]
    if (modelConfig.args && modelConfig.args.length > 0) {
      args.push(...modelConfig.args)
    }

    return {
      args,
      env,
      stdinInput: undefined,
      displayName,
    }
  }

  getRateLimitPatterns(): RegExp[] {
    return [
      /rate.*limit/i,
      /too many requests/i,
      /429/,
    ]
  }

  getQuotaExceededPatterns(): RegExp[] {
    return [
      /quota.*exceed/i,
      /billing.*limit/i,
      /token.*limit/i,
    ]
  }
}
