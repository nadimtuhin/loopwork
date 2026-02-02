# @loopwork-ai/adapters

> Bridge adapters for Loopwork infrastructure and subagent packages.

## Overview

This package provides adapters that bridge the core Loopwork infrastructure (like the CLI executor) to the interfaces expected by subagent packages (like `@loopwork-ai/agents` and `@loopwork-ai/result-parser`).

## Installation

```bash
bun add @loopwork-ai/adapters
```

## Usage

### CLI Adapter

Bridges the `ICliExecutor` to the `IRunnerAdapter` interface.

```typescript
import { CliAdapter } from '@loopwork-ai/adapters'
import { CliExecutor } from '@loopwork-ai/loopwork'

const executor = new CliExecutor(...)
const adapter = new CliAdapter(executor)

const result = await adapter.run({
  prompt: '...',
})
```

### Git Adapter

Provides Git operations for the result parser.

```typescript
import { GitAdapter } from '@loopwork-ai/adapters'

const adapter = new GitAdapter('/path/to/project')
const diff = await adapter.diff(['HEAD'])
```

## License

MIT
