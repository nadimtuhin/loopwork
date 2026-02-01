import type {
  ITestEnvironment,
  SetupResult,
  TeardownResult,
  TestContext,
  TestEnvironmentOptions,
} from '@loopwork-ai/contracts'

/**
 * TestEnvironment - Manages test setup and teardown lifecycle
 *
 * Provides a controlled environment for tests with proper initialization,
 * setup/teardown hooks, and cleanup capabilities.
 */
export class TestEnvironment implements ITestEnvironment {
  readonly name: string
  private context: TestContext | null
  private initialized: boolean
  private options: TestEnvironmentOptions

  constructor(name: string, options: TestEnvironmentOptions = {}) {
    this.name = name
    this.context = null
    this.initialized = false
    this.options = {
      setupTimeoutMs: 30000,
      teardownTimeoutMs: 30000,
      autoCleanup: true,
      captureLogs: false,
      ...options,
    }
  }

  async initialize(options?: TestEnvironmentOptions): Promise<SetupResult> {
    if (this.initialized) {
      return {
        success: true,
        context: this.context ?? undefined,
      }
    }

    try {
      this.options = { ...this.options, ...options }

      const testId = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const workingDir = process.cwd()
      const env = Object.fromEntries(
        Object.entries({ ...process.env, ...this.options.env }).filter(
          ([, v]) => v !== undefined
        )
      ) as Record<string, string>

      this.context = {
        testId,
        workingDir,
        env,
        metadata: new Map(),
      }

      this.initialized = true

      return {
        success: true,
        context: this.context,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async setup(context: TestContext): Promise<SetupResult> {
    if (!this.initialized) {
      const initResult = await this.initialize()
      if (!initResult.success) {
        return initResult
      }
    }

    try {
      this.context = {
        ...this.context,
        ...context,
        metadata: new Map([...(this.context?.metadata ?? []), ...context.metadata]),
      }

      return {
        success: true,
        context: this.context,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async teardown(context: TestContext): Promise<TeardownResult> {
    try {
      if (this.options.autoCleanup) {
        // Cleanup logic would go here
      }

      return {
        success: true,
        cleanupComplete: true,
      }
    } catch (error) {
      return {
        success: false,
        cleanupComplete: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async finalize(): Promise<TeardownResult> {
    try {
      if (this.options.autoCleanup && this.context) {
        await this.teardown(this.context)
      }

      this.context = null
      this.initialized = false

      return {
        success: true,
        cleanupComplete: true,
      }
    } catch (error) {
      return {
        success: false,
        cleanupComplete: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  getContext(): TestContext | null {
    return this.context
  }

  isInitialized(): boolean {
    return this.initialized
  }
}
