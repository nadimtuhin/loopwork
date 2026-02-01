import type { ICliStrategy, ICliStrategyContext, ICliPrepareResult } from '@loopwork-ai/contracts'

export class CrushStrategy implements ICliStrategy {
  readonly cliType = 'crush' as const

  prepare(context: ICliStrategyContext): ICliPrepareResult {
    const { modelConfig, prompt, env } = context
    const modelName = modelConfig.displayName || modelConfig.name
    const displayName = `crush/${modelName}`

    const args = ['run']
    if (modelConfig.model) {
      args.push('-m', modelConfig.model)
    }
    args.push(prompt)

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
    ]
  }
}
