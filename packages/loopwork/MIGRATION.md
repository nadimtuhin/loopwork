# Migration Guide: v0.3.x to v0.4.0

Loopwork v0.4.0 introduces a modular architecture, splitting the core framework into specialized packages within a Bun workspace monorepo. While we've maintained backward compatibility for most users, advanced users who import internal modules or write custom plugins may need to update their code.

## Key Changes

- **Modularization**: The monolithic `packages/loopwork` has been split into several specialized packages:
  - `@loopwork-ai/contracts`: Core interfaces and domain contracts (zero dependencies).
  - `@loopwork-ai/common`: Shared utilities, loggers, and error types.
  - `@loopwork-ai/state`: Session tracking and state management.
  - `@loopwork-ai/executor`: AI CLI execution engine and model selection.
  - `@loopwork-ai/process-manager`: Lifecycle management for spawned processes.
  - `@loopwork-ai/resilience`: Retry strategies and circuit breakers.

- **Dependency Injection**: Services now use constructor-based Dependency Injection (DI) rather than global singletons, improving testability and isolation.

- **Standardized Output**: The terminal output system has migrated to an Ink-based TUI. Legacy console logging utilities are deprecated.

---

## Breaking Changes & Migration Steps

### 1. Internal Import Paths

If you were importing internal modules from `@loopwork-ai/loopwork/src/*`, these paths no longer work. You should now import from the respective scoped packages.

**OLD (v0.3.x):**
```typescript
import { StateManager } from '@loopwork-ai/loopwork/src/core/state'
import { CliExecutor } from '@loopwork-ai/loopwork/src/core/cli'
import { ILogger } from '@loopwork-ai/loopwork/src/contracts'
```

**NEW (v0.4.0):**
```typescript
import { PersistenceStateManager } from '@loopwork-ai/state'
import { CliExecutor } from '@loopwork-ai/executor'
import { ILogger } from '@loopwork-ai/contracts'
```

### 2. Dependency Injection for Plugin Authors

Plugins and services no longer rely on global state. When implementing custom services, inject dependencies via the constructor. This is especially important for plugin authors who need to interact with the core registry or state.

**OLD (v0.3.x):**
```typescript
import { logger } from '@loopwork-ai/loopwork/src/core/utils'

export class MyService {
  doWork() {
    logger.info('Doing work')
  }
}
```

**NEW (v0.4.0):**
```typescript
import { ILogger, IPluginRegistry } from '@loopwork-ai/contracts'

export class MyService {
  constructor(
    private logger: ILogger,
    private pluginRegistry: IPluginRegistry
  ) {}

  async doWork() {
    this.logger.info('Doing work')
    // Interact with other plugins
    await this.pluginRegistry.emit('my-plugin:action', { data: 'test' })
  }
}
```

### 3. Testing with Mocks

The new modular architecture makes testing significantly easier. You can now inject mock implementations of core services in your tests.

**Example: Testing a plugin with a mock logger**
```typescript
import { expect, test, mock } from 'bun:test'
import { ILogger } from '@loopwork-ai/contracts'
import { MyPlugin } from './my-plugin'

test('my plugin logs start', async () => {
  const mockLogger = {
    info: mock(() => {}),
    error: mock(() => {}),
  } as unknown as ILogger

  const plugin = new MyPlugin(mockLogger)
  await plugin.onTaskStart({} as any)

  expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Starting'))
})
```

### 4. Output Utilities

The legacy `src/core/output.ts` utilities are deprecated in favor of Ink components.

**OLD (v0.3.x):**
```typescript
import { printBanner } from '@loopwork-ai/loopwork/src/core/output'
printBanner('Task Complete')
```

**NEW (v0.4.0):**
```typescript
import { Banner } from '@loopwork-ai/loopwork' // or '@loopwork-ai/ui-components'
// Use within an Ink/React context
<Banner title="Task Complete" />
```

---

## Backward Compatibility

The main package `@loopwork-ai/loopwork` still re-exports the public API. Your `loopwork.config.ts` should continue to work without changes if you are using standard plugins and configuration helpers.

The following exports remain available from `@loopwork-ai/loopwork`:
- `defineConfig`, `compose`
- `withJSONBackend`, `withGitHubBackend`
- `withTelegram`, `withDiscord`, `withCostTracking`, etc.
- `ModelPresets`, `RetryPresets`

---

## Upgrade Steps

1. **Update Dependencies**:
   Run `bun install` to ensure all workspace packages are correctly linked.

2. **Fix Imports**:
   Update any internal imports to use the new scoped packages as shown in the examples above.

3. **Run Tests**:
   Ensure your custom plugins and configurations still pass:
   ```bash
   bun run test
   ```

4. **Verify CLI**:
   The binary has moved to `packages/loopwork/bin/loopwork`. Ensure your PATH is updated or use `bun run start` from the repository root.
