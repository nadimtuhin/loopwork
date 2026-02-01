import fs from 'fs'
import os from 'os'
import path from 'path'
import type { ICliStrategy, ICliStrategyContext, ICliPrepareResult, ILogger } from '@loopwork-ai/contracts'

const CACHE_CORRUPTION_PATTERNS = [
  /ENOENT.*reading.*\.cache\/opencode/i,
  /ENOENT.*\.cache\/opencode\/node_modules/i,
  /BuildMessage:.*ENOENT.*opencode/i,
]

export class OpenCodeStrategy implements ICliStrategy {
  readonly cliType = 'opencode' as const
  private logger?: ILogger

  constructor(logger?: ILogger) {
    this.logger = logger
  }

  prepare(context: ICliStrategyContext): ICliPrepareResult {
    const { modelConfig, prompt, env, permissions } = context
    const modelName = modelConfig.displayName || modelConfig.name
    const displayName = `opencode/${modelName}`

    const modifiedEnv = { ...env }
    if (!modifiedEnv['OPENCODE_PERMISSION']) {
      modifiedEnv['OPENCODE_PERMISSION'] = permissions?.['OPENCODE_PERMISSION'] || '{"*":"allow"}'
    }

    const args = ['run', '--model', modelConfig.model, prompt]
    if (modelConfig.args && modelConfig.args.length > 0) {
      args.push(...modelConfig.args)
    }

    return {
      args,
      env: modifiedEnv,
      stdinInput: undefined,
      displayName,
    }
  }

  detectCacheCorruption(output: string): boolean {
    return CACHE_CORRUPTION_PATTERNS.some(pattern => pattern.test(output))
  }

  clearCache(): boolean {
    const homeDir = os.homedir()
    const cachePath = path.join(homeDir, '.cache', 'opencode')

    try {
      const nodeModulesPath = path.join(cachePath, 'node_modules')
      const bunLockPath = path.join(cachePath, 'bun.lock')

      if (fs.existsSync(nodeModulesPath)) {
        fs.rmSync(nodeModulesPath, { recursive: true, force: true })
        this.logger?.warn?.(`Cleared corrupted OpenCode cache: ${nodeModulesPath}`)
      }

      if (fs.existsSync(bunLockPath)) {
        fs.unlinkSync(bunLockPath)
        this.logger?.warn?.(`Cleared OpenCode lock file: ${bunLockPath}`)
      }

      return true
    } catch (error) {
      this.logger?.error?.(`Failed to clear OpenCode cache: ${error}`)
      return false
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
