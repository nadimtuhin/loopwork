# @loopwork-ai/checkpoint

Core checkpoint management system for Loopwork agents. Handles state persistence, recovery, and execution history.

## Features

- **State Persistence**: Saves agent state (phase, iteration, memory) to disk.
- **Output Capture**: Stores CLI output logs for resuming context.
- **Recovery**: Restores agent state and output to resume execution.
- **Cleanup**: Utilities for managing and pruning old checkpoints.

## Usage

```typescript
import { createCheckpointManager } from '@loopwork-ai/checkpoint'

const manager = createCheckpointManager({
  basePath: './.loopwork/checkpoints'
})

// Save a checkpoint
await manager.checkpoint('agent-1', {
  taskId: 'TASK-1',
  phase: 'executing',
  iteration: 5,
  state: { ... }
})

// Restore a checkpoint
const context = await manager.restore('agent-1')
if (context) {
  console.log('Resumed from iteration', context.checkpoint.iteration)
}

// List checkpoints
const ids = await manager.list()

// Cleanup old checkpoints
await manager.cleanup(7) // older than 7 days
```

## Architecture

- **CheckpointManager**: High-level API for saving/restoring state and handling events.
- **FileCheckpointStorage**: File-system based storage implementation.
- **Interfaces**: `ICheckpointManager`, `ICheckpointStorage`, `AgentCheckpoint`.
