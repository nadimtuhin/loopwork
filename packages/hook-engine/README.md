# @loopwork-ai/hook-engine

> Hook engine for the new plugin system

[![npm version](https://img.shields.io/npm/v/@loopwork-ai/hook-engine.svg)](https://www.npmjs.com/package/@loopwork-ai/hook-engine)

## Overview

The `@loopwork-ai/hook-engine` package provides the foundation for the new plugin system in Loopwork.
It enables plugin lifecycle management and hook orchestration.

## Installation

```bash
bun add @loopwork-ai/hook-engine
```

## Usage

```typescript
import { HookEngine } from '@loopwork-ai/hook-engine'

const engine = new HookEngine()

// Register a hook handler
engine.register('before:task', async (context) => {
  console.log('Before task:', context.data)
  return context
})

// Execute hooks
const result = await engine.execute('before:task', {
  data: { taskId: 'TASK-001' }
})
```

## API

### HookEngine

The core class for managing hooks.

- `register<T>(name: string, handler: HookHandler<T>): void` - Register a handler
- `unregister(name: string, handler: HookHandler): void` - Unregister a handler
- `execute<T>(name: string, context: HookContext<T>): Promise<HookContext<T>>` - Execute hooks
- `hasHandlers(name: string): boolean` - Check if handlers exist
- `getRegisteredHooks(): string[]` - Get all hook names
- `clear(): void` - Clear all hooks

## License

MIT
