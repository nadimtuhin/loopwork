import type { ICliStrategy, ICliStrategyContext, ICliPrepareResult } from '@loopwork-ai/contracts'

export class KimiStrategy implements ICliStrategy {
  readonly cliType = 'kimi' as const

  prepare(context: ICliStrategyContext): ICliPrepareResult {
    const { modelConfig, prompt, env, permissions } = context
    const modelName = modelConfig.displayName || modelConfig.name
    const displayName = `kimi/${modelName}`

    const modifiedEnv = { ...env }
    if (permissions?.['MOONSHOT_API_KEY']) {
      modifiedEnv['MOONSHOT_API_KEY'] = permissions['MOONSHOT_API_KEY']
    }

    const args: string[] = []
    if (modelConfig.args && modelConfig.args.length > 0) {
      args.push(...modelConfig.args)
    }

    return {
      args,
      env: modifiedEnv,
      stdinInput: prompt,
      displayName,
    }
  }

  getRateLimitPatterns(): RegExp[] {
    return [
      /rate.*limit/i,
      /too many requests/i,
      /429/,
      /message.*limit/i,
    ]
  }

  getQuotaExceededPatterns(): RegExp[] {
    return [
      /quota.*exceed/i,
      /billing.*limit/i,
    ]
  }
}
