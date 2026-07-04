/**
 * Config Command
 *
 * Displays and inspects the current Loopwork configuration.
 */

import type {
  ICommand,
  CommandContext,
  CommandResult,
  CommandOptions,
} from '@loopwork-ai/contracts'

export interface ConfigOptions {
  /** Path to config file */
  configPath?: string
  /** Output format (json, pretty) */
  format?: 'json' | 'pretty'
  /** Show only specific config keys */
  keys?: string[]
  /** Validate config without outputting */
  validate?: boolean
}

interface ConfigData {
  [key: string]: unknown
}

function detectCircularRefs(obj: ConfigData, visited = new Set<object>()): boolean {
  if (typeof obj !== 'object' || obj === null) {
    return false
  }
  if (visited.has(obj)) {
    return true
  }
  visited.add(obj)
  for (const value of Object.values(obj)) {
    if (detectCircularRefs(value as ConfigData, visited)) {
      return true
    }
  }
  visited.delete(obj)
  return false
}

export class ConfigCommand implements ICommand {
  readonly name = 'config'
  readonly description = 'Display and inspect the current Loopwork configuration'
  readonly usage = '[options]'
  readonly examples = [
    { command: 'loopwork config', description: 'Show current configuration in pretty format' },
    { command: 'loopwork config --json', description: 'Show configuration as JSON' },
    { command: 'loopwork config --keys models,backend', description: 'Show specific config keys' },
    { command: 'loopwork config --validate', description: 'Validate configuration file' },
  ]
  readonly seeAlso = ['loopwork init', 'loopwork status']

  async execute(context: CommandContext, options: CommandOptions): Promise<CommandResult> {
    const opts = options as ConfigOptions
    const logger = context.logger
    const path = context.path

    try {
      const configPath = opts.configPath ?? 'loopwork.config.ts'
      const format = opts.format ?? 'pretty'
      const keys = opts.keys

      if (!context.fs.existsSync(configPath)) {
        logger.error(`Configuration file not found: ${configPath}`)
        return {
          success: false,
          code: 1,
          message: `Configuration file not found: ${configPath}`,
        }
      }

      const configContent = context.fs.readFileSync(configPath, 'utf-8')

      if (opts.validate) {
        logger.success(`Configuration file is valid: ${configPath}`)
        return {
          success: true,
          code: 0,
          message: 'Configuration is valid',
          data: { path: configPath, valid: true },
        }
      }

      let configData: ConfigData

      try {
        const tempModule = { exports: {} as ConfigData }
        const requireFn = (path: string) => {
          if (path === configPath || path.endsWith(configPath)) {
            return tempModule.exports
          }
          return require(path)
        }
        const importFn = async (path: string) => {
          if (path === configPath || path.endsWith(configPath)) {
            return tempModule.exports
          }
          return require(path)
        }

        if (configPath.endsWith('.json')) {
          configData = JSON.parse(configContent) as ConfigData
        } else {
          const moduleContent = configContent
          const evalContent = `(function(module, exports, require) { ${moduleContent} })({}, (v) => v, (p) => require(p))`
          eval(evalContent)

          if (Object.keys(tempModule.exports).length === 0) {
            const defaultMatch = configContent.match(/export\s+default\s+([\s\S]*?)(?:;|$)/)
            if (defaultMatch) {
              logger.warn('Could not parse config directly, showing raw content')
              configData = { raw: configContent }
            } else {
              configData = { raw: configContent }
            }
          } else {
            configData = tempModule.exports
          }
        }
      } catch (parseError) {
        logger.warn(`Could not parse config: ${parseError instanceof Error ? parseError.message : String(parseError)}`)
        logger.info('Showing configuration content as-is')
        configData = { raw: configContent }
      }

      if (keys && keys.length > 0) {
        const filteredData: ConfigData = {}
        for (const key of keys) {
          if (key in configData) {
            filteredData[key] = configData[key]
          }
        }
        configData = filteredData
      }

      if (detectCircularRefs(configData)) {
        logger.warn('Configuration contains circular references, showing as string')
        configData = { raw: '[Circular reference detected]' }
      }

      if (format === 'json') {
        const jsonOutput = JSON.stringify(configData, null, 2)
        logger.raw(jsonOutput)
        return {
          success: true,
          code: 0,
          message: 'Configuration displayed',
          data: { config: configData },
        }
      }

      logger.raw('')
      logger.raw('===========================================')
      logger.raw('Loopwork Configuration')
      logger.raw('===========================================')
      logger.raw('')
      logger.raw(`Config file: ${configPath}`)
      logger.raw('')

      this.printConfig(logger, configData, '', 0)

      logger.raw('')
      logger.raw('===========================================')

      return {
        success: true,
        code: 0,
        message: 'Configuration displayed',
        data: { config: configData },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error(`Failed to display configuration: ${message}`)
      return {
        success: false,
        code: 1,
        message: `Configuration display failed: ${message}`,
      }
    }
  }

  private printConfig(
    logger: CommandContext['logger'],
    obj: ConfigData,
    prefix: string,
    depth: number
  ): void {
    const indent = '  '.repeat(depth)

    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key

      if (typeof value === 'object' && value !== null && !Array.isArray(value) && depth < 2) {
        logger.raw(`${indent}${key}:`)
        this.printConfig(logger, value as ConfigData, fullKey, depth + 1)
      } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && depth < 2) {
        logger.raw(`${indent}${key}: [`)
        for (let i = 0; i < value.length; i++) {
          logger.raw(`${indent}  ${i + 1}.`)
          this.printConfig(logger, value[i] as ConfigData, `${fullKey}[${i}]`, depth + 2)
        }
        logger.raw(`${indent}]`)
      } else if (typeof value === 'string') {
        logger.raw(`${indent}${key}: "${value}"`)
      } else {
        logger.raw(`${indent}${key}: ${String(value)}`)
      }
    }
  }

  validate?(options: CommandOptions): string | undefined {
    const opts = options as ConfigOptions
    if (opts.format !== undefined && !['json', 'pretty'].includes(opts.format)) {
      return 'format must be "json" or "pretty"'
    }
    if (opts.configPath !== undefined && typeof opts.configPath !== 'string') {
      return 'configPath must be a string'
    }
    return undefined
  }
}

export function createConfigCommand(): ICommand {
  return new ConfigCommand()
}
