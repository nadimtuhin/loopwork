/**
 * Model Configuration Registry
 *
 * Like medicine: generic name (what you call it) → brand/actual model (what CLI uses)
 *
 * - Generic name: "gemini-flash" (internal reference)
 * - Brand/Model: "google/antigravity-gemini-3-flash" (actual CLI model string)
 */

export interface ModelConfig {
  /** Generic name - internal reference (e.g., 'gemini-flash') */
  name: string
  /** Display name for UI/logs */
  displayName: string
  /** CLI to use (claude, opencode, droid) */
  cli: 'claude' | 'opencode' | 'droid' | string
  /** Actual model string to pass to CLI (e.g., 'google/antigravity-gemini-3-flash') */
  model: string
  /** Timeout in seconds */
  timeout?: number
  /** Cost weight for budget tracking */
  costWeight?: number
}

export interface IModelConfigRegistry {
  /** Register a model config by its generic name */
  register(config: ModelConfig): void
  /** Get config by generic name */
  get(genericName: string): ModelConfig | undefined
  /** Check if a generic name is registered */
  has(genericName: string): boolean
  /** List all registered configs */
  list(): readonly ModelConfig[]
  /** Get the actual model string for a generic name */
  getModelString(genericName: string): string | undefined
  /** Get the CLI for a generic name */
  getCli(genericName: string): string | undefined
}

/**
 * Model Config Registry
 *
 * Maps generic names to full model configurations.
 *
 * @example
 * ```typescript
 * const registry = new ModelConfigRegistry()
 *
 * registry.register({
 *   name: 'gemini-flash',
 *   displayName: 'Gemini Flash',
 *   cli: 'opencode',
 *   model: 'google/antigravity-gemini-3-flash',
 *   timeout: 180,
 *   costWeight: 15,
 * })
 *
 * // Look up by generic name
 * registry.getModelString('gemini-flash') // → 'google/antigravity-gemini-3-flash'
 * registry.getCli('gemini-flash')         // → 'opencode'
 * ```
 */
export class ModelConfigRegistry implements IModelConfigRegistry {
  private configs = new Map<string, ModelConfig>()

  register(config: ModelConfig): void {
    this.configs.set(config.name.toLowerCase(), config)
  }

  get(genericName: string): ModelConfig | undefined {
    return this.configs.get(genericName.toLowerCase())
  }

  has(genericName: string): boolean {
    return this.configs.has(genericName.toLowerCase())
  }

  list(): readonly ModelConfig[] {
    return Array.from(this.configs.values())
  }

  getModelString(genericName: string): string | undefined {
    return this.get(genericName)?.model
  }

  getCli(genericName: string): string | undefined {
    return this.get(genericName)?.cli
  }
}

// ============================================================================
// BUILT-IN MODEL PRESETS
// ============================================================================

/**
 * Built-in model presets - factory functions that create ModelConfig
 */
export const ModelPresets = {
  /**
   * Gemini Flash via OpenCode - fast
   */
  geminiFlash: (overrides?: Partial<ModelConfig>): ModelConfig => ({
    name: 'gemini-flash',
    displayName: 'Gemini Flash',
    cli: 'opencode',
    model: 'google/antigravity-gemini-3-flash',
    timeout: 180,
    costWeight: 15,
    ...overrides,
  }),

  /**
   * Gemini Pro via OpenCode - balanced
   */
  geminiPro: (overrides?: Partial<ModelConfig>): ModelConfig => ({
    name: 'gemini-pro',
    displayName: 'Gemini Pro',
    cli: 'opencode',
    model: 'google/gemini-1.5-pro',
    timeout: 300,
    costWeight: 50,
    ...overrides,
  }),

  /**
   * Claude Sonnet via Claude Code - balanced
   */
  claudeSonnet: (overrides?: Partial<ModelConfig>): ModelConfig => ({
    name: 'claude-sonnet',
    displayName: 'Claude Sonnet',
    cli: 'claude',
    model: 'sonnet',
    timeout: 300,
    costWeight: 30,
    ...overrides,
  }),

  /**
   * Claude Opus via Claude Code - powerful
   */
  claudeOpus: (overrides?: Partial<ModelConfig>): ModelConfig => ({
    name: 'claude-opus',
    displayName: 'Claude Opus',
    cli: 'claude',
    model: 'opus',
    timeout: 600,
    costWeight: 100,
    ...overrides,
  }),

  /**
   * Claude Haiku via Claude Code - fast & cheap
   */
  claudeHaiku: (overrides?: Partial<ModelConfig>): ModelConfig => ({
    name: 'claude-haiku',
    displayName: 'Claude Haiku',
    cli: 'claude',
    model: 'haiku',
    timeout: 120,
    costWeight: 5,
    ...overrides,
  }),

  /**
   * GPT-4o via Droid - OpenAI
   */
  gpt4o: (overrides?: Partial<ModelConfig>): ModelConfig => ({
    name: 'gpt-4o',
    displayName: 'GPT-4o',
    cli: 'droid',
    model: 'openai/gpt-4o',
    timeout: 300,
    costWeight: 60,
    ...overrides,
  }),

  /**
   * GPT-4 Turbo via Droid - OpenAI
   */
  gpt4Turbo: (overrides?: Partial<ModelConfig>): ModelConfig => ({
    name: 'gpt-4-turbo',
    displayName: 'GPT-4 Turbo',
    cli: 'droid',
    model: 'openai/gpt-4-turbo',
    timeout: 300,
    costWeight: 40,
    ...overrides,
  }),
}

// ============================================================================
// SINGLETON
// ============================================================================

let defaultRegistry: ModelConfigRegistry | null = null

export function getModelConfigRegistry(): ModelConfigRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new ModelConfigRegistry()
    // Pre-register built-in presets
    defaultRegistry.register(ModelPresets.geminiFlash())
    defaultRegistry.register(ModelPresets.geminiPro())
    defaultRegistry.register(ModelPresets.claudeSonnet())
    defaultRegistry.register(ModelPresets.claudeOpus())
    defaultRegistry.register(ModelPresets.claudeHaiku())
    defaultRegistry.register(ModelPresets.gpt4o())
    defaultRegistry.register(ModelPresets.gpt4Turbo())
  }
  return defaultRegistry
}

export function resetModelConfigRegistry(): void {
  defaultRegistry = null
}

/**
 * Quick lookup: generic name → actual model string
 */
export function getModelString(genericName: string): string | undefined {
  return getModelConfigRegistry().getModelString(genericName)
}

/**
 * Quick lookup: generic name → CLI
 */
export function getModelCli(genericName: string): string | undefined {
  return getModelConfigRegistry().getCli(genericName)
}

/**
 * Quick lookup: generic name → full config
 */
export function getModelConfig(genericName: string): ModelConfig | undefined {
  return getModelConfigRegistry().get(genericName)
}
