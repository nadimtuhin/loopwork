import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'
import chalk from 'chalk'
import { logger as defaultLogger } from '../core/utils'
import type { ModelConfig } from '../contracts/cli'

/**
 * Models Configure Command
 *
 * Interactive command to configure OpenCode models from authenticated providers.
 * Reads from ~/.local/share/opencode/auth.json to detect available providers,
 * fetches models for each provider, and lets user select which to enable.
 */

export interface ModelsConfigureOptions {
  /** Provider to configure (if not specified, shows all) */
  provider?: string
  /** Auto-enable all models without prompting */
  all?: boolean
  /** Output as JSON */
  json?: boolean
}

export interface ModelsConfigureDeps {
  logger?: typeof defaultLogger
  process?: NodeJS.Process
  fs?: {
    existsSync: typeof fs.existsSync
    readFileSync: typeof fs.readFileSync
    writeFileSync: typeof fs.writeFileSync
    mkdirSync: typeof fs.mkdirSync
  }
  spawn?: typeof spawn
  homedir?: typeof os.homedir
}

interface Provider {
  name: string
  type: 'oauth' | 'api'
  authenticated: boolean
}

interface Model {
  id: string
  provider: string
  displayName: string
}

interface ModelsByProvider {
  [provider: string]: Model[]
}

function resolveDeps(deps: ModelsConfigureDeps = {}) {
  return {
    logger: deps.logger ?? defaultLogger,
    process: deps.process ?? process,
    fs: deps.fs ?? {
      existsSync: fs.existsSync,
      readFileSync: fs.readFileSync,
      writeFileSync: fs.writeFileSync,
      mkdirSync: fs.mkdirSync,
    },
    spawn: deps.spawn ?? spawn,
    homedir: deps.homedir ?? os.homedir,
  }
}

/**
 * Read authenticated providers from OpenCode auth.json
 */
function getAuthenticatedProviders(deps: ReturnType<typeof resolveDeps>): Provider[] {
  const authPath = path.join(deps.homedir(), '.local/share/opencode/auth.json')

  if (!deps.fs.existsSync(authPath)) {
    throw new Error(`OpenCode auth file not found at ${authPath}`)
  }

  const authData = JSON.parse(deps.fs.readFileSync(authPath, 'utf-8'))
  const providers: Provider[] = []

  for (const [name, config] of Object.entries(authData)) {
    if (typeof config === 'object' && config !== null && 'type' in config) {
      providers.push({
        name,
        type: (config as any).type, // eslint-disable-line @typescript-eslint/no-explicit-any
        authenticated: true,
      })
    }
  }

  return providers
}

/**
 * Fetch models for a specific provider using opencode CLI
 */
async function fetchModelsForProvider(
  provider: string,
  deps: ReturnType<typeof resolveDeps>
): Promise<Model[]> {
  return new Promise((resolve, reject) => {
    const child = deps.spawn('opencode', ['models', provider], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Failed to fetch models for ${provider}: ${stderr}`))
        return
      }

      // Parse model IDs from output
      const lines = stdout.trim().split('\n').filter(line => line.trim())
      const models: Model[] = lines
        .filter(line => line.startsWith(`${provider}/`))
        .map(line => {
          const id = line.trim()
          const modelName = id.split('/')[1]
          return {
            id,
            provider,
            displayName: modelName,
          }
        })

      resolve(models)
    })

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn opencode: ${err.message}`))
    })
  })
}

/**
 * Fetch all models grouped by provider
 */
async function fetchAllModels(
  providers: Provider[],
  deps: ReturnType<typeof resolveDeps>
): Promise<ModelsByProvider> {
  const modelsByProvider: ModelsByProvider = {}

  for (const provider of providers) {
    try {
      deps.logger.info(`Fetching models for ${chalk.cyan(provider.name)}...`)
      const models = await fetchModelsForProvider(provider.name, deps)
      if (models.length > 0) {
        modelsByProvider[provider.name] = models
      }
    } catch (err) {
      deps.logger.warn(`Failed to fetch models for ${provider.name}: ${err}`)
    }
  }

  return modelsByProvider
}

/**
 * Display models in a readable format
 */
function _displayModels(modelsByProvider: ModelsByProvider, deps: ReturnType<typeof resolveDeps>) {
  deps.logger.raw('\n' + chalk.bold('Available Models:') + '\n')

  for (const [provider, models] of Object.entries(modelsByProvider)) {
    deps.logger.raw(chalk.bold.cyan(`\n${provider}`) + chalk.gray(` (${models.length} models)`))
    models.forEach((model, index) => {
      deps.logger.raw(`  ${(index + 1).toString().padStart(2)}. ${model.displayName}`)
    })
  }

  deps.logger.raw('')
}

/**
 * Get current enabled models from loopwork config
 */
function _getEnabledModels(deps: ReturnType<typeof resolveDeps>): Set<string> {
  const _configPath = path.join(deps.process.cwd(), 'loopwork.config.ts')
  const enabled = new Set<string>()

  // TODO: Parse loopwork.config.ts to extract currently enabled models
  // For now, return empty set

  return enabled
}

/**
 * Save selected models to loopwork config
 */
function saveModelsConfig(
  selectedModels: Model[],
  deps: ReturnType<typeof resolveDeps>
): void {
  const configDir = path.join(deps.process.cwd(), '.loopwork')
  const configPath = path.join(configDir, 'models.json')

  // Ensure directory exists
  if (!deps.fs.existsSync(configDir)) {
    deps.fs.mkdirSync(configDir, { recursive: true })
  }

  // Convert to ModelConfig format
  const modelConfigs: ModelConfig[] = selectedModels.map(model => ({
    name: model.id,
    displayName: model.displayName,
    cli: 'opencode' as const,
    modelId: model.id,
    enabled: true,
  }))

  deps.fs.writeFileSync(
    configPath,
    JSON.stringify({ models: modelConfigs }, null, 2),
    'utf-8'
  )

  deps.logger.success(`Saved ${selectedModels.length} models to ${configPath}`)
}

/**
 * Interactive model selection by provider
 */
async function selectModels(
  modelsByProvider: ModelsByProvider,
  deps: ReturnType<typeof resolveDeps>
): Promise<Model[]> {
  const selectedModels: Model[] = []

  deps.logger.raw('\n' + chalk.bold.cyan('Interactive Model Selection') + '\n')
  deps.logger.raw(chalk.gray('Showing providers with available models:\n'))

  // Display each provider with sample models
  for (const [provider, models] of Object.entries(modelsByProvider)) {
    deps.logger.raw(`\n${chalk.bold.green('✓')} ${chalk.bold(provider)} ${chalk.gray(`(${models.length} models)`)}`)

    // Show first 5 models as examples
    const sampleModels = models.slice(0, 5)
    sampleModels.forEach(m => {
      deps.logger.raw(`    ${chalk.gray('•')} ${m.displayName}`)
    })
    if (models.length > 5) {
      deps.logger.raw(`    ${chalk.gray(`... and ${models.length - 5} more models`)}`)
    }

    // Auto-select all models for this provider
    selectedModels.push(...models)
  }

  deps.logger.raw('')
  deps.logger.info(chalk.green(`Enabling all models from selected providers`))

  return selectedModels
}

/**
 * Main command implementation
 */
export async function modelsConfigure(
  options: ModelsConfigureOptions = {},
  deps: ModelsConfigureDeps = {}
): Promise<void> {
  const resolved = resolveDeps(deps)

  try {
    resolved.logger.info('Configuring OpenCode models...\n')

    // 1. Get authenticated providers
    const providers = getAuthenticatedProviders(resolved)
    if (providers.length === 0) {
      resolved.logger.warn('No authenticated providers found in OpenCode')
      resolved.logger.info('Run `opencode auth` to authenticate providers first')
      return
    }

    resolved.logger.success(`Found ${providers.length} authenticated provider(s):\n`)
    providers.forEach(p => {
      resolved.logger.raw(`  ${chalk.green('✓')} ${chalk.cyan(p.name)} (${p.type})`)
    })
    resolved.logger.raw('')

    // 2. Fetch models for each provider
    const modelsByProvider = await fetchAllModels(
      options.provider ? providers.filter(p => p.name === options.provider) : providers,
      resolved
    )

    if (Object.keys(modelsByProvider).length === 0) {
      resolved.logger.warn('No models found for authenticated providers')
      return
    }

    // 3. Display models
    if (options.json) {
      console.log(JSON.stringify(modelsByProvider, null, 2))
      return
    }

    // 4. Select models (interactive or all)
    let selectedModels: Model[]
    if (options.all) {
      selectedModels = Object.values(modelsByProvider).flat()
      resolved.logger.info(`Auto-enabling all ${selectedModels.length} models`)
    } else {
      selectedModels = await selectModels(modelsByProvider, resolved)
    }

    // 5. Save configuration
    if (selectedModels.length > 0) {
      saveModelsConfig(selectedModels, resolved)

      resolved.logger.raw('')
      resolved.logger.info('Next steps:')
      resolved.logger.info('  1. Add models to your loopwork.config.ts:')
      resolved.logger.raw(chalk.gray('     import models from \'./.loopwork/models.json\''))
      resolved.logger.raw(chalk.gray('     export default compose('))
      resolved.logger.raw(chalk.gray('       withModels(models.models),'))
      resolved.logger.raw(chalk.gray('       // ... other plugins'))
      resolved.logger.raw(chalk.gray('     )(defineConfig({ ... }))'))
      resolved.logger.raw('')
      resolved.logger.info('  2. Or manually copy models to your config file')
    }

  } catch (err) {
    if (err instanceof Error) {
      resolved.logger.error(`Error: ${err.message}`)
    } else {
      resolved.logger.error('An unknown error occurred')
    }
    resolved.process.exit(1)
  }
}
