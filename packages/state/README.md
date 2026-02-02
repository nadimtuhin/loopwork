# @loopwork-ai/state

> State management and persistence for Loopwork

[![npm version](https://img.shields.io/npm/v/@loopwork-ai/state.svg)](https://www.npmjs.com/package/@loopwork-ai/state)

## Overview

The `@loopwork-ai/state` package provides high-level state management built on top of the persistence layer contract from `@loopwork-ai/contracts`. It handles session tracking, plugin state persistence, and exclusive locking.

## Installation

```bash
bun add @loopwork-ai/state
```

## Architecture

### Persistence Layer

The package includes a file-based persistence implementation:

```typescript
import { FilePersistenceLayer } from '@loopwork-ai/state'

const persistence = new FilePersistenceLayer({
  baseDir: '.loopwork/state',
})

await persistence.initialize()

// Store data
await persistence.set('task-001', { status: 'completed' })

// Retrieve data
const data = await persistence.get('task-001')

// Atomic updates
await persistence.atomicUpdate('counter', (current) => (current ?? 0) + 1)
```

#### FilePersistenceLayer API

```typescript
class FilePersistenceLayer implements IPersistenceLayer {
  /** Name identifier for this persistence layer */
  readonly name = 'file'

  constructor(options: { baseDir: string })

  /** Initialize the persistence layer */
  initialize(): Promise<void>

  /** Check if a key exists */
  exists(key: string): Promise<boolean>

  /** Get a value from storage */
  get<T = unknown>(key: string): Promise<T | null>

  /** Set a value in storage */
  set<T = unknown>(key: string, value: T): Promise<void>

  /** Delete a value from storage */
  delete(key: string): Promise<void>

  /** List all keys, optionally filtered by pattern */
  keys(pattern?: string): Promise<string[]>

  /** Acquire an exclusive lock */
  acquireLock(lockName: string, options?: LockOptions): Promise<LockInfo | null>

  /** Release a previously acquired lock */
  releaseLock(lockId: string): Promise<void>

  /** Check if a lock is held */
  isLocked(lockName: string): Promise<boolean>

  /** Atomically update a value */
  atomicUpdate<T = unknown>(key: string, operation: (current: T | null) => T): Promise<void>

  /** Check storage health */
  healthCheck(): Promise<StorageHealth>
}
```

### State Manager

The `PersistenceStateManager` provides high-level state management:

```typescript
import { PersistenceStateManager } from '@loopwork-ai/state'
import { FilePersistenceLayer } from '@loopwork-ai/state'

const persistence = new FilePersistenceLayer({ baseDir: '.loopwork/state' })
const stateManager = new PersistenceStateManager({
  persistence,
  namespace: 'default',
  debug: true,
})

await stateManager.initialize()

// Acquire lock for exclusive access
const lockAcquired = await stateManager.acquireLock()
if (lockAcquired) {
  // Save execution state
  await stateManager.saveState(currentIssue, iteration)

  // Load previous state
  const { snapshot, success } = await stateManager.loadState()

  // Plugin state management
  await stateManager.setPluginState('my-plugin', { data: 'value' })
  const pluginState = await stateManager.getPluginState('my-plugin')

  // Release lock when done
  await stateManager.releaseLock()
}

await stateManager.dispose()
```

#### PersistenceStateManager API

```typescript
class PersistenceStateManager implements IStateManager {
  constructor(config: StateManagerConfig)

  /** Initialize state manager and underlying persistence */
  initialize(): Promise<void>

  /** Cleanup resources before shutdown */
  dispose(): Promise<void>

  /** Get the namespace for this state manager */
  getNamespace(): string

  /** Acquire exclusive lock */
  acquireLock(retryCount?: number): Promise<boolean>

  /** Release previously acquired lock */
  releaseLock(): Promise<void>

  /** Check if a lock is currently held */
  isLocked(): Promise<boolean>

  /** Save current execution state */
  saveState(currentIssue: number, iteration: number): Promise<void>

  /** Load previously saved execution state */
  loadState(): Promise<LoadStateResult>

  /** Clear saved execution state */
  clearState(): Promise<void>

  /** Get state for a specific plugin */
  getPluginState<T = unknown>(pluginName: string): Promise<T | null>

  /** Set state for a specific plugin */
  setPluginState<T = unknown>(pluginName: string, state: T): Promise<void>

  /** Delete state for a specific plugin */
  deletePluginState(pluginName: string): Promise<void>

  /** Check if plugin state exists */
  hasPluginState(pluginName: string): Promise<boolean>

  /** List all plugins with saved state */
  listPlugins(): Promise<string[]>
}
```

## Usage with Contracts

```typescript
import type {
  IStateManager,
  StateManagerConfig,
  StateSnapshot,
  LoadStateResult,
  IPersistenceLayer,
} from '@loopwork-ai/contracts'

import { PersistenceStateManager, FilePersistenceLayer } from '@loopwork-ai/state'
```

## Lock Management

The state package provides file-based locking for concurrent execution safety:

```typescript
// Acquire lock with retry
const lock = await persistence.acquireLock('session-lock', {
  timeout: 5000,
  retryInterval: 100,
  maxRetries: 50,
})

if (lock) {
  try {
    // Critical section
    await performAtomicOperation()
  } finally {
    await persistence.releaseLock(lock.lockId)
  }
}
```

## Related Packages

- `@loopwork-ai/contracts` - Interface definitions (`IStateManager`, `IPersistenceLayer`)
- `@loopwork-ai/loopwork` - Main framework that uses state management

## License

MIT
