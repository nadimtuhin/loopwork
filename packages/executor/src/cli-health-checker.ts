/**
 * CLI Health Checker
 *
 * Pre-flight validation for CLI tools to ensure they're working before
 * starting parallel execution. Detects cache corruption, missing binaries,
 * and other common CLI issues.
 */

import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { ILogger, ModelConfig, CliType } from '@loopwork-ai/contracts'

export interface HealthCheckResult {
  cli: string
  model?: string
  healthy: boolean
  error?: string
  cacheCleared?: boolean
  responseTimeMs: number
}

export interface ValidatedModelConfig extends ModelConfig {
  healthStatus: 'healthy' | 'unhealthy' | 'degraded'
  lastError?: string
  validationTime: number
}

export interface CliHealthCheckerOptions {
  testTimeoutMs?: number
  maxRetries?: number
  autoClearCache?: boolean
  logger?: ILogger
}

/**
 * OpenCode cache corruption error patterns
 */
const OPENCODE_CACHE_CORRUPTION_PATTERNS = [
  /ENOENT.*reading.*\.cache\/opencode/i,
  /ENOENT.*\.cache\/opencode\/node_modules/i,
  /BuildMessage:.*ENOENT.*opencode/i,
  /Cannot find module.*opencode/i,
  /cache.*corrupted/i,
]

/**
 * Check if output indicates OpenCode cache corruption
 */
function isOpenCodeCacheCorruption(output: string): boolean {
  return OPENCODE_CACHE_CORRUPTION_PATTERNS.some(pattern => pattern.test(output))
}

/**
 * Clear OpenCode cache directory
 */
function clearOpenCodeCache(logger?: ILogger): boolean {
  const homeDir = os.homedir()
  const cachePath = path.join(homeDir, '.cache', 'opencode')
  
  try {
    const nodeModulesPath = path.join(cachePath, 'node_modules')
    const bunLockPath = path.join(cachePath, 'bun.lock')
    
    if (fs.existsSync(nodeModulesPath)) {
      fs.rmSync(nodeModulesPath, { recursive: true, force: true })
      logger?.warn?.(`[HealthCheck] Cleared corrupted OpenCode cache: ${nodeModulesPath}`)
    }
    
    if (fs.existsSync(bunLockPath)) {
      fs.unlinkSync(bunLockPath)
      logger?.warn?.(`[HealthCheck] Cleared OpenCode lock file: ${bunLockPath}`)
    }
    
    return true
  } catch (error) {
    logger?.error?.(`[HealthCheck] Failed to clear OpenCode cache: ${error}`)
    return false
  }
}

export class CliHealthChecker {
  private options: Required<CliHealthCheckerOptions>
  private results: Map<string, HealthCheckResult> = new Map()

  constructor(options: CliHealthCheckerOptions = {}) {
    this.options = {
      testTimeoutMs: options.testTimeoutMs ?? 30000,
      maxRetries: options.maxRetries ?? 1,
      autoClearCache: options.autoClearCache ?? true,
      logger: options.logger,
    }
  }

  /**
   * Validate a single CLI binary exists and is executable
   */
  async validateCliBinary(cliPath: string, cliType: CliType): Promise<HealthCheckResult> {
    const startTime = Date.now()
    const cacheKey = `binary:${cliPath}`

    // Check if already validated
    if (this.results.has(cacheKey)) {
      return this.results.get(cacheKey)!
    }

    // Check binary exists
    if (!fs.existsSync(cliPath)) {
      const result: HealthCheckResult = {
        cli: cliType,
        healthy: false,
        error: `CLI binary not found: ${cliPath}`,
        responseTimeMs: Date.now() - startTime,
      }
      this.results.set(cacheKey, result)
      return result
    }

    // Try to get version/help to verify it runs
    const result = await this.runCliTest(cliPath, cliType, ['--version'], '', startTime)
    this.results.set(cacheKey, result)
    return result
  }

  /**
   * Validate a specific CLI + model combination works
   */
  async validateModel(
    cliPath: string, 
    modelConfig: ModelConfig,
    attempt: number = 0
  ): Promise<HealthCheckResult> {
    const startTime = Date.now()
    const cacheKey = `${modelConfig.cli}:${modelConfig.model}`

    // Check if already validated
    if (this.results.has(cacheKey)) {
      const cached = this.results.get(cacheKey)!
      if (cached.healthy || attempt > 0) {
        return cached
      }
    }

    this.options.logger?.debug?.(
      `[HealthCheck] Validating ${modelConfig.cli}/${modelConfig.name}...`
    )

    // Run a simple test prompt
    const testPrompt = 'Say "OK" and nothing else.'
    const args = this.buildArgs(modelConfig, testPrompt)
    
    let result = await this.runCliTest(cliPath, modelConfig.cli, args, testPrompt, startTime)

    // Handle cache corruption with auto-retry
    if (!result.healthy && 
        modelConfig.cli === 'opencode' && 
        isOpenCodeCacheCorruption(result.error || '') &&
        this.options.autoClearCache &&
        attempt < this.options.maxRetries) {
      
      this.options.logger?.warn?.(
        `[HealthCheck] Cache corruption detected for ${modelConfig.name}, clearing cache...`
      )
      
      const cleared = clearOpenCodeCache(this.options.logger)
      if (cleared) {
        // Retry after clearing cache
        result = await this.validateModel(cliPath, modelConfig, attempt + 1)
        result.cacheCleared = true
      }
    }

    this.results.set(cacheKey, result)
    return result
  }

  /**
   * Validate all models in parallel and return healthy ones
   */
  async validateAllModels(
    cliPaths: Map<string, string>,
    models: ModelConfig[]
  ): Promise<{
    healthy: ValidatedModelConfig[]
    unhealthy: ValidatedModelConfig[]
    summary: { total: number; healthy: number; unhealthy: number; cacheCleared: number }
  }> {
    this.options.logger?.info?.('[HealthCheck] Starting pre-flight CLI validation...')
    
    const uniqueModels = this.deduplicateModels(models)
    const healthy: ValidatedModelConfig[] = []
    const unhealthy: ValidatedModelConfig[] = []
    let cacheClearedCount = 0

    // Validate in parallel with concurrency limit
    const concurrencyLimit = 3
    const batches: ModelConfig[][] = []
    
    for (let i = 0; i < uniqueModels.length; i += concurrencyLimit) {
      batches.push(uniqueModels.slice(i, i + concurrencyLimit))
    }

    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(async (model) => {
          const cliPath = cliPaths.get(model.cli)
          if (!cliPath) {
            return {
              ...model,
              healthStatus: 'unhealthy' as const,
              lastError: `CLI ${model.cli} not found in paths`,
              validationTime: 0,
            }
          }

          const result = await this.validateModel(cliPath, model)
          
          if (result.cacheCleared) {
            cacheClearedCount++
          }

          return {
            ...model,
            healthStatus: result.healthy ? 'healthy' : 'unhealthy' as const,
            lastError: result.error,
            validationTime: result.responseTimeMs,
          }
        })
      )

      for (const config of batchResults) {
        if (config.healthStatus === 'healthy') {
          healthy.push(config)
        } else {
          unhealthy.push(config)
        }
      }

      // Log progress
      for (const config of batchResults) {
        const icon = config.healthStatus === 'healthy' ? '✓' : '✗'
        const displayName = `${config.cli}/${config.name}`
        this.options.logger?.info?.(
          `[HealthCheck] ${icon} ${displayName}${config.lastError ? ` - ${config.lastError.slice(0, 60)}` : ''}`
        )
      }
    }

    const summary = {
      total: uniqueModels.length,
      healthy: healthy.length,
      unhealthy: unhealthy.length,
      cacheCleared: cacheClearedCount,
    }

    this.options.logger?.info?.(
      `[HealthCheck] Validation complete: ${summary.healthy}/${summary.total} healthy` +
        (summary.cacheCleared > 0 ? ` (${summary.cacheCleared} cache clears)` : '')
    )

    return { healthy, unhealthy, summary }
  }

  /**
   * Check if we have minimum required healthy models
   */
  hasMinimumHealthyModels(
    healthyCount: number,
    minimumRequired: number = 1
  ): { sufficient: boolean; canContinue: boolean } {
    const sufficient = healthyCount >= minimumRequired
    const canContinue = healthyCount > 0

    return { sufficient, canContinue }
  }

  /**
   * Get validation results
   */
  getResults(): Map<string, HealthCheckResult> {
    return new Map(this.results)
  }

  /**
   * Clear all cached results
   */
  clearCache(): void {
    this.results.clear()
  }

  /**
   * Build CLI arguments for a model
   */
  private buildArgs(modelConfig: ModelConfig, prompt: string): string[] {
    if (modelConfig.cli === 'opencode') {
      return ['run', '--model', modelConfig.model, prompt]
    }
    if (modelConfig.cli === 'claude') {
      return ['--model', modelConfig.model]
    }
    if (modelConfig.cli === 'gemini') {
      return ['--model', modelConfig.model, prompt]
    }
    return []
  }

  /**
   * Run a CLI test and capture results
   */
  private runCliTest(
    cliPath: string,
    cliType: CliType,
    args: string[],
    input: string,
    startTime: number
  ): Promise<HealthCheckResult> {
    return new Promise((resolve) => {
      const output: string[] = []
      const errorOutput: string[] = []
      
      const child = spawn(cliPath, args, {
        env: { 
          ...process.env,
          // For opencode, ensure permissions are set
          ...(cliType === 'opencode' ? { OPENCODE_PERMISSION: '{"*":"allow"}' } : {}),
        },
      })

      // Capture stdout
      child.stdout?.on('data', (data) => {
        output.push(data.toString())
      })

      // Capture stderr
      child.stderr?.on('data', (data) => {
        errorOutput.push(data.toString())
      })

      // Send input for CLIs that need it
      if (input && child.stdin) {
        child.stdin.write(input)
        child.stdin.end()
      }

      // Handle timeout
      const timeout = setTimeout(() => {
        child.kill('SIGTERM')
        setTimeout(() => child.kill('SIGKILL'), 5000)
        
        resolve({
          cli: cliType,
          healthy: false,
          error: `Health check timeout after ${this.options.testTimeoutMs}ms`,
          responseTimeMs: Date.now() - startTime,
        })
      }, this.options.testTimeoutMs)

      // Handle completion
      child.on('close', (code) => {
        clearTimeout(timeout)
        
        const fullOutput = output.join('')
        const fullError = errorOutput.join('')
        const combinedOutput = `${fullOutput}\n${fullError}`
        
        // For health check, exit code 0 is success, but we also accept
        // any output that shows the CLI is working (not a cache error)
        const isCacheError = isOpenCodeCacheCorruption(combinedOutput)
        const hasOutput = fullOutput.trim().length > 0
        
        // Consider healthy if:
        // - Exit code is 0 and has output, OR
        // - Has output and no cache error (some CLIs return non-zero for test prompts)
        const healthy = (code === 0 && hasOutput) || (hasOutput && !isCacheError)
        
        resolve({
          cli: cliType,
          healthy,
          error: healthy ? undefined : (isCacheError ? `Cache corruption: ${fullError.slice(0, 100)}` : `Exit code ${code}: ${fullError.slice(0, 100)}`),
          responseTimeMs: Date.now() - startTime,
        })
      })

      child.on('error', (err) => {
        clearTimeout(timeout)
        resolve({
          cli: cliType,
          healthy: false,
          error: `Spawn error: ${err.message}`,
          responseTimeMs: Date.now() - startTime,
        })
      })
    })
  }

  /**
   * Deduplicate models by cli+model combination
   */
  private deduplicateModels(models: ModelConfig[]): ModelConfig[] {
    const seen = new Set<string>()
    return models.filter((model) => {
      const key = `${model.cli}:${model.model}`
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
  }
}

/**
 * Create a health checker with default options
 */
export function createHealthChecker(options?: CliHealthCheckerOptions): CliHealthChecker {
  return new CliHealthChecker(options)
}

/**
 * Quick health check for a single CLI
 */
export async function quickHealthCheck(
  cliPath: string,
  cliType: CliType,
  logger?: ILogger
): Promise<boolean> {
  const checker = new CliHealthChecker({ logger, testTimeoutMs: 10000 })
  const result = await checker.validateCliBinary(cliPath, cliType)
  return result.healthy
}
