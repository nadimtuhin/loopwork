import type { ICliStrategy, ICliStrategyContext, ICliPrepareResult } from '@loopwork-ai/contracts'

export class GeminiStrategy implements ICliStrategy {
  readonly cliType = 'gemini' as const

  prepare(context: ICliStrategyContext): ICliPrepareResult {
    const { modelConfig, prompt, env } = context
    const modelName = modelConfig.displayName || modelConfig.name
    const displayName = `gemini/${modelName}`

    const args = ['--model', modelConfig.model]
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
      /RESOURCE_EXHAUSTED/i,
    ]
  }

  getQuotaExceededPatterns(): RegExp[] {
    return [
      /quota.*exceed/i,
      /billing.*limit/i,
    ]
  }
}
