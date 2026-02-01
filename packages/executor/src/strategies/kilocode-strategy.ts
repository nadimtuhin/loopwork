import type { ICliStrategy, ICliStrategyContext, ICliPrepareResult } from '@loopwork-ai/contracts'

export class KilocodeStrategy implements ICliStrategy {
  readonly cliType = 'kilocode' as const

  prepare(context: ICliStrategyContext): ICliPrepareResult {
    const { modelConfig, prompt, env } = context
    const modelName = modelConfig.displayName || modelConfig.name
    const displayName = `kilocode/${modelName}`

    const args: string[] = []
    if (modelConfig.args && modelConfig.args.length > 0) {
      args.push(...modelConfig.args)
    }

    return {
      args,
      env,
      stdinInput: prompt,
      displayName,
    }
  }

  getRateLimitPatterns(): RegExp[] {
    return [
      /rate.*limit/i,
      /too many requests/i,
      /429/,
      /Free Tier Rate Limit Exceeded/i,
    ]
  }

  getQuotaExceededPatterns(): RegExp[] {
    return [
      /quota.*exceed/i,
      /billing.*limit/i,
    ]
  }
}
