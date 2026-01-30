import { describe, test, expect } from 'bun:test'
import {
  withCli,
  withModels,
  withRetry,
  withCliPaths,
  withSelectionStrategy,
  createModel,
  ModelPresets,
  RetryPresets,
  defineConfig,
  compose,
} from '../src/plugins'
import type { LoopworkConfig, ModelConfig, RetryConfig } from '../src/contracts'
import {
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CLI_EXECUTOR_CONFIG,
} from '../src/contracts/cli'

describe('CLI Configuration Types', () => {
  describe('DEFAULT_RETRY_CONFIG', () => {
    test('has expected default values', () => {
      expect(DEFAULT_RETRY_CONFIG.rateLimitWaitMs).toBe(60000)
      expect(DEFAULT_RETRY_CONFIG.exponentialBackoff).toBe(false)
      expect(DEFAULT_RETRY_CONFIG.baseDelayMs).toBe(1000)
      expect(DEFAULT_RETRY_CONFIG.maxDelayMs).toBe(60000)
      expect(DEFAULT_RETRY_CONFIG.retrySameModel).toBe(false)
      expect(DEFAULT_RETRY_CONFIG.maxRetriesPerModel).toBe(1)
    })
  })

  describe('DEFAULT_CLI_EXECUTOR_CONFIG', () => {
    test('has expected default values', () => {
      expect(DEFAULT_CLI_EXECUTOR_CONFIG.selectionStrategy).toBe('round-robin')
      expect(DEFAULT_CLI_EXECUTOR_CONFIG.sigkillDelayMs).toBe(5000)
      expect(DEFAULT_CLI_EXECUTOR_CONFIG.progressIntervalMs).toBe(2000)
      expect(DEFAULT_CLI_EXECUTOR_CONFIG.retry).toEqual(DEFAULT_RETRY_CONFIG)
    })
  })
})

describe('withCli plugin', () => {
  test('adds cliConfig to config', () => {
    const config = defineConfig({
      backend: { type: 'json', tasksFile: 'tasks.json' },
    })

    const result = withCli({
      models: [{ name: 'test', cli: 'claude', model: 'sonnet' }],
    })(config)

    expect(result.cliConfig).toBeDefined()
    expect(result.cliConfig?.models).toHaveLength(1)
    expect(result.cliConfig?.models?.[0].name).toBe('test')
  })

  test('merges with existing cliConfig', () => {
    const config: LoopworkConfig = {
      backend: { type: 'json', tasksFile: 'tasks.json' },
      cliConfig: {
        selectionStrategy: 'priority',
      },
    }

    const result = withCli({
      models: [{ name: 'test', cli: 'claude', model: 'sonnet' }],
    })(config)

    expect(result.cliConfig?.selectionStrategy).toBe('priority')
    expect(result.cliConfig?.models).toHaveLength(1)
  })

  test('deep merges retry config', () => {
    const config: LoopworkConfig = {
      backend: { type: 'json', tasksFile: 'tasks.json' },
      cliConfig: {
        retry: { rateLimitWaitMs: 120000 },
      },
    }

    const result = withCli({
      retry: { exponentialBackoff: true },
    })(config)

    expect(result.cliConfig?.retry?.rateLimitWaitMs).toBe(120000)
    expect(result.cliConfig?.retry?.exponentialBackoff).toBe(true)
  })

  test('deep merges cliPaths', () => {
    const config: LoopworkConfig = {
      backend: { type: 'json', tasksFile: 'tasks.json' },
      cliConfig: {
        cliPaths: { claude: '/path/to/claude' },
      },
    }

    const result = withCli({
      cliPaths: { opencode: '/path/to/opencode' },
    })(config)

    expect(result.cliConfig?.cliPaths?.claude).toBe('/path/to/claude')
    expect(result.cliConfig?.cliPaths?.opencode).toBe('/path/to/opencode')
  })
})

describe('withModels plugin', () => {
  test('sets models in cliConfig', () => {
    const models: ModelConfig[] = [
      { name: 'sonnet', cli: 'claude', model: 'sonnet', timeout: 300 },
      { name: 'haiku', cli: 'claude', model: 'haiku', timeout: 120 },
    ]

    const config = defineConfig({
      backend: { type: 'json', tasksFile: 'tasks.json' },
    })

    const result = withModels({ models })(config)

    expect(result.cliConfig?.models).toEqual(models)
  })

  test('sets fallback models', () => {
    const models: ModelConfig[] = [
      { name: 'sonnet', cli: 'claude', model: 'sonnet' },
    ]
    const fallbackModels: ModelConfig[] = [
      { name: 'opus', cli: 'claude', model: 'opus' },
    ]

    const config = defineConfig({
      backend: { type: 'json', tasksFile: 'tasks.json' },
    })

    const result = withModels({ models, fallbackModels })(config)

    expect(result.cliConfig?.fallbackModels).toEqual(fallbackModels)
  })

  test('sets selection strategy', () => {
    const config = defineConfig({
      backend: { type: 'json', tasksFile: 'tasks.json' },
    })

    const result = withModels({
      models: [{ name: 'sonnet', cli: 'claude', model: 'sonnet' }],
      strategy: 'cost-aware',
    })(config)

    expect(result.cliConfig?.selectionStrategy).toBe('cost-aware')
  })
})

describe('withRetry plugin', () => {
  test('sets retry config', () => {
    const config = defineConfig({
      backend: { type: 'json', tasksFile: 'tasks.json' },
    })

    const result = withRetry({
      exponentialBackoff: true,
      maxDelayMs: 300000,
    })(config)

    expect(result.cliConfig?.retry?.exponentialBackoff).toBe(true)
    expect(result.cliConfig?.retry?.maxDelayMs).toBe(300000)
  })

  test('merges with existing retry config', () => {
    const config: LoopworkConfig = {
      backend: { type: 'json', tasksFile: 'tasks.json' },
      cliConfig: {
        retry: { rateLimitWaitMs: 120000 },
      },
    }

    const result = withRetry({ retrySameModel: true })(config)

    expect(result.cliConfig?.retry?.rateLimitWaitMs).toBe(120000)
    expect(result.cliConfig?.retry?.retrySameModel).toBe(true)
  })
})

describe('withCliPaths plugin', () => {
  test('sets CLI paths', () => {
    const config = defineConfig({
      backend: { type: 'json', tasksFile: 'tasks.json' },
    })

    const result = withCliPaths({
      claude: '/custom/claude',
      opencode: '/custom/opencode',
    })(config)

    expect(result.cliConfig?.cliPaths?.claude).toBe('/custom/claude')
    expect(result.cliConfig?.cliPaths?.opencode).toBe('/custom/opencode')
  })
})

describe('withSelectionStrategy plugin', () => {
  test('sets selection strategy', () => {
    const config = defineConfig({
      backend: { type: 'json', tasksFile: 'tasks.json' },
    })

    const result = withSelectionStrategy('cost-aware')(config)

    expect(result.cliConfig?.selectionStrategy).toBe('cost-aware')
  })
})

describe('createModel helper', () => {
  test('creates model with defaults', () => {
    const model = createModel({
      name: 'test',
      cli: 'claude',
      model: 'sonnet',
    })

    expect(model.name).toBe('test')
    expect(model.cli).toBe('claude')
    expect(model.model).toBe('sonnet')
    expect(model.enabled).toBe(true)
    expect(model.costWeight).toBe(50)
  })

  test('allows overriding defaults', () => {
    const model = createModel({
      name: 'test',
      cli: 'claude',
      model: 'opus',
      enabled: false,
      costWeight: 100,
      timeout: 900,
    })

    expect(model.enabled).toBe(false)
    expect(model.costWeight).toBe(100)
    expect(model.timeout).toBe(900)
  })
})

describe('ModelPresets', () => {
  test('claudeSonnet preset', () => {
    const model = ModelPresets.claudeSonnet()
    expect(model.name).toBe('claude-sonnet')
    expect(model.cli).toBe('claude')
    expect(model.model).toBe('sonnet')
    expect(model.timeout).toBe(300)
    expect(model.costWeight).toBe(30)
  })

  test('claudeOpus preset', () => {
    const model = ModelPresets.claudeOpus()
    expect(model.name).toBe('claude-opus')
    expect(model.cli).toBe('claude')
    expect(model.model).toBe('opus')
    expect(model.timeout).toBe(900)
    expect(model.costWeight).toBe(100)
  })

  test('claudeHaiku preset', () => {
    const model = ModelPresets.claudeHaiku()
    expect(model.name).toBe('claude-haiku')
    expect(model.cli).toBe('claude')
    expect(model.model).toBe('haiku')
    expect(model.timeout).toBe(120)
    expect(model.costWeight).toBe(10)
  })

  test('geminiFlash preset', () => {
    const model = ModelPresets.geminiFlash()
    expect(model.name).toBe('gemini-flash')
    expect(model.cli).toBe('opencode')
    expect(model.timeout).toBe(180)
    expect(model.costWeight).toBe(15)
  })

  test('geminiPro preset', () => {
    const model = ModelPresets.geminiPro()
    expect(model.name).toBe('gemini-pro')
    expect(model.cli).toBe('opencode')
    expect(model.timeout).toBe(600)
    expect(model.costWeight).toBe(60)
  })

  test('presets accept overrides', () => {
    const model = ModelPresets.claudeSonnet({ timeout: 600, costWeight: 50 })
    expect(model.timeout).toBe(600)
    expect(model.costWeight).toBe(50)
    expect(model.name).toBe('claude-sonnet') // unchanged
  })
})

describe('RetryPresets', () => {
  test('default preset', () => {
    const retry = RetryPresets.default()
    expect(retry.rateLimitWaitMs).toBe(60000)
    expect(retry.exponentialBackoff).toBe(false)
  })

  test('aggressive preset', () => {
    const retry = RetryPresets.aggressive()
    expect(retry.exponentialBackoff).toBe(true)
    expect(retry.retrySameModel).toBe(true)
    expect(retry.maxRetriesPerModel).toBe(3)
    expect(retry.maxDelayMs).toBe(300000)
  })

  test('gentle preset', () => {
    const retry = RetryPresets.gentle()
    expect(retry.rateLimitWaitMs).toBe(120000)
    expect(retry.exponentialBackoff).toBe(false)
    expect(retry.retrySameModel).toBe(false)
  })
})

describe('compose with CLI plugins', () => {
  test('composes multiple CLI plugins', () => {
    const config = compose(
      withModels({
        models: [ModelPresets.claudeSonnet()],
        fallbackModels: [ModelPresets.claudeOpus()],
      }),
      withRetry(RetryPresets.aggressive()),
      withCliPaths({ claude: '/custom/claude' }),
      withSelectionStrategy('cost-aware'),
    )(defineConfig({
      backend: { type: 'json', tasksFile: 'tasks.json' },
    }))

    expect(config.cliConfig?.models).toHaveLength(1)
    expect(config.cliConfig?.models?.[0].name).toBe('claude-sonnet')
    expect(config.cliConfig?.fallbackModels).toHaveLength(1)
    expect(config.cliConfig?.retry?.exponentialBackoff).toBe(true)
    expect(config.cliConfig?.cliPaths?.claude).toBe('/custom/claude')
    expect(config.cliConfig?.selectionStrategy).toBe('cost-aware')
  })
})

describe('Backward compatibility', () => {
  test('legacy cli field still works', () => {
    const config = defineConfig({
      backend: { type: 'json', tasksFile: 'tasks.json' },
      cli: 'claude',
      model: 'sonnet',
      timeout: 600,
    })

    expect(config.cli).toBe('claude')
    expect(config.model).toBe('sonnet')
    expect(config.timeout).toBe(600)
  })

  test('cliConfig exists alongside legacy fields', () => {
    const config = compose(
      withCli({
        models: [ModelPresets.claudeSonnet()],
      }),
    )(defineConfig({
      backend: { type: 'json', tasksFile: 'tasks.json' },
      cli: 'claude', // legacy
      model: 'sonnet', // legacy
    }))

    // Both should coexist
    expect(config.cli).toBe('claude')
    expect(config.model).toBe('sonnet')
    expect(config.cliConfig?.models).toHaveLength(1)
  })
})

describe('Example configurations from plan', () => {
  test('basic unchanged config', () => {
    const config = defineConfig({
      backend: { type: 'json', tasksFile: 'tasks.json' },
      cli: 'claude',
      timeout: 600,
    })

    expect(config.cli).toBe('claude')
    expect(config.timeout).toBe(600)
  })

  test('custom model pool', () => {
    const config = compose(
      withCli({
        models: [
          { name: 'sonnet', cli: 'claude', model: 'sonnet', timeout: 300 },
          { name: 'haiku', cli: 'claude', model: 'haiku', timeout: 120 },
        ],
        fallbackModels: [
          { name: 'opus', cli: 'claude', model: 'opus', timeout: 900 },
        ],
      }),
    )(defineConfig({
      backend: { type: 'json', tasksFile: 'tasks.json' },
    }))

    expect(config.cliConfig?.models).toHaveLength(2)
    expect(config.cliConfig?.fallbackModels).toHaveLength(1)
  })

  test('cost-aware with custom args', () => {
    const config = compose(
      withCli({
        models: [
          { name: 'haiku', cli: 'claude', model: 'haiku', costWeight: 1, timeout: 60 },
          { name: 'sonnet', cli: 'claude', model: 'sonnet', costWeight: 5, timeout: 300 },
          {
            name: 'opus',
            cli: 'claude',
            model: 'opus',
            costWeight: 15,
            timeout: 900,
            args: ['--thinking-mode', 'deep'],
          },
        ],
        selectionStrategy: 'cost-aware',
        retry: { exponentialBackoff: true, maxDelayMs: 300000 },
      }),
    )(defineConfig({
      backend: { type: 'json', tasksFile: 'tasks.json' },
    }))

    expect(config.cliConfig?.selectionStrategy).toBe('cost-aware')
    expect(config.cliConfig?.models?.[2].args).toEqual(['--thinking-mode', 'deep'])
    expect(config.cliConfig?.retry?.exponentialBackoff).toBe(true)
  })
})
