# @loopwork-ai/executor

> AI CLI execution engine for Loopwork

[![npm version](https://img.shields.io/npm/v/@loopwork-ai/executor.svg)](https://www.npmjs.com/package/@loopwork-ai/executor)

## Overview

The `@loopwork-ai/executor` package provides the core engine for executing AI CLI commands. It handles model selection, health monitoring, circuit breaking, and automatic retries with fallback strategies.

## Installation

```bash
bun add @loopwork-ai/executor
```

## Architecture

### CLI Executor

The `CliExecutor` class manages AI CLI execution:

```typescript
import { CliExecutor } from '@loopwork-ai/executor'

const executor = new CliExecutor({
  models: [
    { name: 'claude-sonnet', cli: 'claude', model: 'sonnet' },
  ],
  fallbackModels: [
    { name: 'claude-opus', cli: 'claude', model: 'opus' },
  ],
  retry: {
    rateLimitWaitMs: 30000,
    maxRetriesPerModel: 3,
  },
})

const exitCode = await executor.execute(
  'Analyze the codebase and identify improvements',
  'output.txt',
  300
)
```

### Model Selection

The `ModelSelector` class manages model pools and selection strategies:

```typescript
import { ModelSelector } from '@loopwork-ai/executor'

const selector = new ModelSelector(
  primaryModels,
  fallbackModels,
  'round-robin',
  {
    enableCircuitBreaker: true,
    failureThreshold: 3,
    resetTimeoutMs: 600000,
  }
)

const model = selector.getNext()
```

### Circuit Breaker

The circuit breaker pattern prevents repeated calls to failing models:

```typescript
import { CircuitBreaker, CircuitBreakerRegistry } from '@loopwork-ai/executor'

const circuitBreaker = new CircuitBreaker({
  failureThreshold: 3,
  resetTimeoutMs: 600000,
})

if (circuitBreaker.canExecute('claude-sonnet')) {
  try {
    await executeModel('claude-sonnet')
    circuitBreaker.recordSuccess('claude-sonnet')
  } catch {
    circuitBreaker.recordFailure('claude-sonnet')
  }
}
```

### Health Checking

The `CliHealthChecker` validates CLI tools before execution:

```typescript
import { CliHealthChecker } from '@loopwork-ai/executor'

const healthChecker = new CliHealthChecker({
  testTimeoutMs: 30000,
  maxRetries: 1,
  logger,
})

const results = await healthChecker.validateAllModels(cliPaths, allModels)
```

## Key Classes

### CliExecutor

```typescript
class CliExecutor {
  constructor(
    config: CliExecutorConfig,
    processManager: IProcessManager,
    pluginRegistry: IPluginRegistry,
    logger: ILogger,
    options?: CliExecutorOptions
  )

  /** Execute a prompt using the configured AI CLI */
  execute(prompt: string, outputFile: string, timeoutSecs: number, options?: ExecutionOptions): Promise<number>

  /** Execute a specific task */
  executeTask(task: ITaskMinimal, prompt: string, outputFile: string, timeoutSecs: number, options?: ExecutionOptions): Promise<number>

  /** Terminate the currently running AI CLI process */
  killCurrent(): void

  /** Cleanup resources before shutdown */
  cleanup(): Promise<void>

  /** Run pre-flight validation on all CLI models */
  runPreflightValidation(minimumRequired?: number): Promise<{ success: boolean; healthy: ValidatedModelConfig[]; unhealthy: ValidatedModelConfig[]; message: string }>

  /** Start progressive validation */
  startProgressiveValidation(minimumRequired?: number): Promise<{ success: boolean; initiallyAvailable: number; message: string; waitForAll: () => Promise<{ totalHealthy: number; totalUnhealthy: number }> }>

  /** Get current health status of models */
  getHealthStatus(): { total: number; available: number; disabled: number; preflightComplete: boolean }

  /** Switch to fallback models */
  switchToFallback(): void
}
```

### ModelSelector

```typescript
class ModelSelector {
  constructor(
    primaryModels: ModelConfig[],
    fallbackModels?: ModelConfig[],
    strategy?: ModelSelectionStrategy,
    options?: ModelSelectorOptions
  )

  /** Peek at the next model without advancing */
  peek(): ModelConfig | null

  /** Get the next model for execution */
  getNext(): ModelConfig | null

  /** Record a successful execution */
  recordSuccess(modelName: string): void

  /** Record a failed execution */
  recordFailure(modelName: string): boolean

  /** Check if using fallback models */
  isUsingFallback(): boolean

  /** Switch to fallback models */
  switchToFallback(): void

  /** Reset to primary models */
  resetToFallback(): void

  /** Get total model count */
  getTotalModelCount(): number
}
```

### CliHealthChecker

```typescript
class CliHealthChecker {
  constructor(options: CliHealthCheckerOptions)

  /** Validate a specific CLI binary */
  validateCliBinary(cliPath: string): Promise<{ healthy: boolean; error?: string }>

  /** Validate a specific model */
  validateModel(cliPath: string, model: ModelConfig): Promise<ValidatedModelConfig>

  /** Validate all models */
  validateAllModels(cliPaths: Map<string, string>, models: ModelConfig[]): Promise<{ healthy: ValidatedModelConfig[]; unhealthy: ValidatedModelConfig[]; summary: HealthCheckSummary }>
}
```

## Configuration

### ModelConfig

```typescript
interface ModelConfig {
  /** Unique name for this model configuration */
  name: string

  /** Display name for user-facing messages */
  displayName?: string

  /** CLI tool to use ('claude', 'opencode', 'gemini', etc.) */
  cli: CliType

  /** Model identifier */
  model: string

  /** Whether this model is enabled */
  enabled?: boolean

  /** Timeout for this specific model */
  timeout?: number

  /** Environment variables for this model */
  env?: Record<string, string>
}
```

### Retry Configuration

```typescript
interface RetryConfig {
  /** Wait time when rate limit is detected (ms) */
  rateLimitWaitMs?: number

  /** Whether to use exponential backoff */
  exponentialBackoff?: boolean

  /** Base delay for backoff (ms) */
  baseDelayMs?: number

  /** Maximum delay for backoff (ms) */
  maxDelayMs?: number

  /** Backoff multiplier */
  backoffMultiplier?: number

  /** Whether to retry on the same model */
  retrySameModel?: boolean

  /** Maximum retries per model */
  maxRetriesPerModel?: number

  /** Delay between model attempts (ms) */
  delayBetweenModelAttemptsMs?: number
}
```

## Strategies

The executor supports different model selection strategies:

- `round-robin` - Cycle through models in order
- `priority` - Use priority ordering
- `cost-aware` - Prefer cheaper models
- `random` - Random selection

## Related Packages

- `@loopwork-ai/contracts` - Interface definitions
- `@loopwork-ai/loopwork` - Main framework
- `@loopwork-ai/resilience` - Retry and backoff policies

## License

MIT
