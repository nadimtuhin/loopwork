# @loopwork-ai/mcp

MCP (Model Context Protocol) integration plugin for Loopwork.

This plugin allows Loopwork to register and manage external MCP servers and local scripts, enabling AI models to use them as tools.

## Installation

```bash
bun add @loopwork-ai/mcp
```

## Usage

Add the plugin to your `loopwork.config.ts`:

```typescript
import { compose, defineConfig } from '@loopwork-ai/loopwork/contracts'
import { withMCP } from '@loopwork-ai/mcp'

export default compose(
  withMCP({
    servers: {
      'weather-server': {
        type: 'stdio',
        command: 'npx',
        args: ['@modelcontextprotocol/server-weather'],
        env: { API_KEY: process.env.WEATHER_API_KEY }
      },
      'memory-server': {
        type: 'sse',
        url: 'http://localhost:3000/sse'
      }
    },
    scripts: {
      'custom-tool': {
        source: './scripts/my-tool.js',
        runtime: 'node'
      }
    },
    logLevel: 'info'
  })
)(defineConfig({
  cli: 'claude',
  maxIterations: 50
}))
```

## Configuration

### MCP Servers

Supports two types of transports:

#### Stdio Transport
- `type: 'stdio'`
- `command`: The command to run the server
- `args`: (Optional) Arguments for the command
- `env`: (Optional) Environment variables for the server process

#### SSE Transport
- `type: 'sse'`
- `url`: The URL of the MCP server's SSE endpoint

### MCP Scripts

Allows defining local scripts as MCP tools:
- `source`: Path to the script or script content
- `runtime`: (Optional) 'node', 'bun', 'python', or 'bash'
- `env`: (Optional) Environment variables for the script

Local scripts are executed via the `LocalScriptBridgeAdapter`, which handles process spawning and bridges them to the MCP tool system. The scripts receive arguments as a JSON string in the first command-line argument and can also access them via the `MCP_TOOL_ARGS` environment variable. Scripts should output their result as JSON to `stdout`.

## Plugin Hooks

The plugin implements the following Loopwork lifecycle hooks:
- `onConfigLoad`: Validates the MCP configuration using Zod.
- `onLoopStart`: Initializes connections to registered MCP servers and local script tools.

## Subagent Tools

The MCP package includes built-in tools for managing subagent execution:

### spawn-subagent

Spawns a subagent to work on a task with automatic checkpoint creation.

```typescript
import { spawnSubagent } from '@loopwork-ai/mcp'

const result = await spawnSubagent({
  agentName: 'architect',
  taskId: 'TASK-001',
  taskTitle: 'Analyze codebase',
  taskDescription: 'Perform deep analysis of auth module'
})

// Returns:
// {
//   agentId: 'architect-TASK-001-1234567890',
//   status: 'spawned',
//   message: 'Agent architect spawned for task TASK-001'
// }
```

### resume-agent

Resumes an interrupted agent by loading its checkpoint.

```typescript
import { resumeAgent } from '@loopwork-ai/mcp'

const result = await resumeAgent({
  agentId: 'architect-TASK-001-1234567890'
})

// Returns:
// {
//   status: 'resumed',
//   checkpoint: {
//     agentId: 'architect-TASK-001-1234567890',
//     taskId: 'TASK-001',
//     agentName: 'architect',
//     iteration: 5,
//     phase: 'executing',
//     timestamp: Date,
//     lastToolCall: 'Read',
//     state: { ... }
//   },
//   message: 'Restored checkpoint for agent architect-TASK-001-1234567890 at iteration 5'
// }
```

### Integration with Agent System

These tools integrate with the `@loopwork-ai/agents` and `@loopwork-ai/checkpoint` packages:

- **spawn-subagent**: Uses `createRegistry()` and `createExecutor()` from `@loopwork-ai/agents`, and `createCheckpointManager()` from `@loopwork-ai/checkpoint`
- **resume-agent**: Uses `createCheckpointManager()` to restore agent state

Both tools support dependency injection for testing:

```typescript
const result = await spawnSubagent(input, {
  registry: mockRegistry,
  executor: mockExecutor,
  checkpointManager: mockCheckpointManager
})
```

## License

MIT
