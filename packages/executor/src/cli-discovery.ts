import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type {
  CliType,
  ICliDiscoveryService,
  ICliDiscoveryResult,
  ICliDiscoveryOptions,
  ICliHealthCheckResult,
  CliHealthStatus,
  ICliPathConfig,
  ILogger,
} from '@loopwork-ai/contracts'
import { DEFAULT_CLI_PATH_CONFIG } from '@loopwork-ai/contracts'

const ALL_CLI_TYPES: CliType[] = ['claude', 'opencode', 'gemini', 'droid', 'crush', 'kimi', 'kilocode']

const CLI_VERSION_COMMANDS: Record<CliType, string[]> = {
  claude: ['--version'],
  opencode: ['--version'],
  gemini: ['--version'],
  droid: ['--version'],
  crush: ['-v'],
  kimi: ['--version'],
  kilocode: ['--version'],
}

const CLI_HEALTH_COMMANDS: Record<CliType, { args: string[]; expectedOutput?: RegExp }> = {
  claude: { args: ['--version'], expectedOutput: /claude|anthropic/i },
  opencode: { args: ['--version'], expectedOutput: /opencode|version/i },
  gemini: { args: ['--version'], expectedOutput: /gemini|google/i },
  droid: { args: ['--version'], expectedOutput: /factory|droid|version/i },
  crush: { args: ['-v'], expectedOutput: /crush|charm/i },
  kimi: { args: ['--version'], expectedOutput: /kimi|moonshot/i },
  kilocode: { args: ['--version'], expectedOutput: /kilocode|kilo/i },
}

const CLI_LIST_MODELS_COMMANDS: Record<CliType, string[] | null> = {
  claude: null,
  opencode: ['models'],
  gemini: null,
  droid: null,
  crush: null,
  kimi: null,
  kilocode: ['models'],
}

export class CliDiscoveryService implements ICliDiscoveryService {
  private pathConfig: ICliPathConfig
  private logger?: ILogger
  private cliPaths: Map<CliType, string> = new Map()
  private healthCache: Map<CliType, ICliHealthCheckResult> = new Map()

  constructor(pathConfig?: ICliPathConfig, logger?: ILogger) {
    this.pathConfig = pathConfig ?? DEFAULT_CLI_PATH_CONFIG
    this.logger = logger
  }

  async discoverAll(options?: ICliDiscoveryOptions): Promise<ICliDiscoveryResult> {
    const timeoutMs = options?.timeoutMs ?? 5000
    const parallel = options?.parallel ?? true
    const skipHealthCheck = options?.skipHealthCheck ?? false

    let results: ICliHealthCheckResult[]

    if (parallel) {
      results = await Promise.all(
        ALL_CLI_TYPES.map(type => this.discoverOne(type, { timeoutMs, skipHealthCheck }))
      )
    } else {
      results = []
      for (const type of ALL_CLI_TYPES) {
        results.push(await this.discoverOne(type, { timeoutMs, skipHealthCheck }))
      }
    }

    const healthyCount = results.filter(r => r.status === 'healthy').length
    const foundCount = results.filter(r => r.status !== 'not_found').length

    return {
      clis: results,
      healthyCount,
      totalCount: ALL_CLI_TYPES.length,
      summary: `${healthyCount}/${foundCount} CLIs healthy (${ALL_CLI_TYPES.length - foundCount} not installed)`,
    }
  }

  async discoverOne(type: CliType, options?: ICliDiscoveryOptions): Promise<ICliHealthCheckResult> {
    const timeoutMs = options?.timeoutMs ?? 5000
    const skipHealthCheck = options?.skipHealthCheck ?? false
    const startTime = Date.now()

    const cliPath = this.findCliPath(type)

    if (!cliPath) {
      return {
        type,
        status: 'not_found',
        checkedAt: new Date(),
      }
    }

    if (skipHealthCheck) {
      return {
        type,
        status: 'healthy',
        path: cliPath,
        checkedAt: new Date(),
      }
    }

    try {
      const healthCheck = CLI_HEALTH_COMMANDS[type]
      const result = spawnSync(cliPath, healthCheck.args, {
        encoding: 'utf-8',
        timeout: timeoutMs,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      const responseTimeMs = Date.now() - startTime
      const output = (result.stdout || '') + (result.stderr || '')

      if (result.error) {
        const errorMessage = result.error.message
        if (errorMessage.includes('ETIMEDOUT') || errorMessage.includes('timed out')) {
          return {
            type,
            status: 'timeout',
            path: cliPath,
            responseTimeMs,
            error: `Timed out after ${timeoutMs}ms`,
            checkedAt: new Date(),
          }
        }
        return {
          type,
          status: 'error',
          path: cliPath,
          responseTimeMs,
          error: errorMessage,
          checkedAt: new Date(),
        }
      }

      const version = this.extractVersion(output, type)
      const isHealthy = result.status === 0 || (healthCheck.expectedOutput && healthCheck.expectedOutput.test(output))

      const healthResult: ICliHealthCheckResult = {
        type,
        status: isHealthy ? 'healthy' : 'unhealthy',
        path: cliPath,
        version,
        responseTimeMs,
        error: isHealthy ? undefined : `Exit code: ${result.status}`,
        checkedAt: new Date(),
      }

      this.healthCache.set(type, healthResult)
      if (isHealthy) {
        this.cliPaths.set(type, cliPath)
      }

      return healthResult
    } catch (error) {
      return {
        type,
        status: 'error',
        path: cliPath,
        responseTimeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
        checkedAt: new Date(),
      }
    }
  }

  async getHealthy(): Promise<CliType[]> {
    const result = await this.discoverAll()
    return result.clis
      .filter(cli => cli.status === 'healthy')
      .map(cli => cli.type)
  }

  async isHealthy(type: CliType): Promise<boolean> {
    const cached = this.healthCache.get(type)
    if (cached && Date.now() - cached.checkedAt.getTime() < 60000) {
      return cached.status === 'healthy'
    }

    const result = await this.discoverOne(type)
    return result.status === 'healthy'
  }

  async listModels(type: CliType): Promise<string[]> {
    const cliPath = this.getCliPath(type)
    if (!cliPath) return []

    const listCommand = CLI_LIST_MODELS_COMMANDS[type]
    if (!listCommand) return []

    try {
      const result = spawnSync(cliPath, listCommand, {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      if (result.status !== 0 || !result.stdout) {
        return []
      }

      const stdout = result.stdout.trim()
      
      if (stdout.startsWith('[') || stdout.startsWith('{')) {
        try {
          const parsed = JSON.parse(stdout)
          if (Array.isArray(parsed)) {
            return parsed.map(m => typeof m === 'string' ? m : (m.id || m.name || JSON.stringify(m)))
          } else if (typeof parsed === 'object' && parsed !== null) {
            const possibleArray = parsed.models || parsed.data || parsed.results || Object.values(parsed).find(Array.isArray)
            if (Array.isArray(possibleArray)) {
              return possibleArray.map(m => typeof m === 'string' ? m : (m.id || m.name || JSON.stringify(m)))
            }
          }
        } catch {
        }
      }

      const models = result.stdout
        .split(/[\n,]/)
        .map(m => m.trim())
        .filter(m => m.length > 0 && !m.toLowerCase().includes('model') && !m.toLowerCase().includes('version'))

      return models
    } catch (error) {
      this.logger?.error?.(`Failed to list models for ${type}: ${error}`)
      return []
    }
  }

  getCliPath(type: CliType): string | undefined {
    return this.cliPaths.get(type) ?? this.findCliPath(type) ?? undefined
  }

  private findCliPath(type: CliType): string | null {
    const home = os.homedir()
    const envVar = this.pathConfig.envVars[type]
    const envPath = process.env[envVar]

    if (envPath && this.isExecutable(envPath)) {
      return envPath
    }

    const whichResult = spawnSync('which', [type], { encoding: 'utf-8' })
    if (whichResult.status === 0 && whichResult.stdout?.trim()) {
      const foundPath = whichResult.stdout.trim()
      if (this.isExecutable(foundPath)) {
        return foundPath
      }
    }

    const defaultPaths = this.pathConfig.defaultPaths[type] || []
    for (const p of defaultPaths) {
      const expandedPath = p.replace('~', home)
      if (this.isExecutable(expandedPath)) {
        return expandedPath
      }
    }

    return null
  }

  private isExecutable(filePath: string): boolean {
    try {
      fs.accessSync(filePath, fs.constants.X_OK)
      return true
    } catch {
      return false
    }
  }

  private extractVersion(output: string, type: CliType): string | undefined {
    const versionPatterns = [
      /v?(\d+\.\d+\.\d+(?:-[\w.]+)?)/,
      /version[:\s]+v?(\d+\.\d+\.\d+)/i,
      /(\d+\.\d+\.\d+)/,
    ]

    for (const pattern of versionPatterns) {
      const match = output.match(pattern)
      if (match) {
        return match[1]
      }
    }

    return undefined
  }

  clearCache(): void {
    this.healthCache.clear()
  }
}

export function createCliDiscoveryService(logger?: ILogger): CliDiscoveryService {
  return new CliDiscoveryService(undefined, logger)
}
