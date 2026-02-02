# @loopwork-ai/contracts

> Shared interfaces and type definitions for Loopwork

[![npm version](https://img.shields.io/npm/v/@loopwork-ai/contracts.svg)](https://www.npmjs.com/package/@loopwork-ai/contracts)

## Overview

The `@loopwork-ai/contracts` package defines the core interfaces and type contracts that ensure consistency across the Loopwork monorepo. These contracts are used by all packages to communicate and interact with each other.

## Installation

```bash
bun add @loopwork-ai/contracts
```

## Architecture

This package is organized into several domains:

### Process Management (`src/process/`)

Interfaces for spawning and managing processes:

- `ISpawnedProcess` - Abstract interface for spawned processes
- `ISpawner` - Interface for process spawning implementations
- `IProcessManager` - Core interface for lifecycle tracking and cleanup

### State Management (`src/state/`)

High-level state management interface:

- `IStateManager` - Session tracking, plugin state, and locking
- `IPersistenceLayer` - Abstraction for persistence implementations
- `StateSnapshot` - Point-in-time snapshot of execution state
- `StateManagerConfig` - Configuration for state manager

### Executor (`src/executor/`)

AI CLI execution contracts:

- `IClExecutor` - Execute AI CLI commands with retry logic
- `IModelSelector` - Model selection strategies
- `IModelProvider` - Model configuration provider
- `ModelConfig` - Model configuration type

### Resilience (`src/resilience.ts`)

Retry and backoff strategies:

- `IRetryStrategy` - Determines if operations should be retried
- `IBackoffPolicy` - Calculates delays between retry attempts
- `IResilienceEngine` - Execution wrapper with automatic retry logic

### Plugin System (`src/plugin/`)

Plugin lifecycle management:

- `LoopworkPlugin` - Base interface for all plugins
- `IPluginRegistry` - Plugin registration and hook execution

## Usage Example

```typescript
import type {
  ICliExecutor,
  ModelConfig,
  IRetryStrategy,
} from '@loopwork-ai/contracts'

// Use contracts to define custom implementations
class MyExecutor implements ICliExecutor {
  async execute(prompt: string, outputFile: string, timeoutSecs: number) {
    // Implementation
    return 0
  }
}
```

## Key Interfaces

### LoopworkPlugin

```typescript
interface LoopworkPlugin {
  /** Unique identifier for the plugin */
  readonly name: string

  /** Classification of the plugin for prioritization */
  readonly classification?: 'critical' | 'enhancement'
}
```

### IStateManager

```typescript
interface IStateManager {
  /** Acquire exclusive lock to prevent concurrent executions */
  acquireLock(retryCount?: number): Promise<boolean>

  /** Save current execution state */
  saveState(currentIssue: number, iteration: number): Promise<void>

  /** Load previously saved execution state */
  loadState(): Promise<LoadStateResult>

  /** Get state for a specific plugin */
  getPluginState<T = unknown>(pluginName: string): Promise<T | null>
}
```

## Related Packages

- `@loopwork-ai/common` - Shared utilities
- `@loopwork-ai/state` - State management implementation
- `@loopwork-ai/executor` - CLI execution implementation
- `@loopwork-ai/loopwork` - Main framework package

## License

MIT
