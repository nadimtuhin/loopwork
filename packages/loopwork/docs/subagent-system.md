# Subagent System Architecture

This document describes the Claude Code-style subagent pattern implementation in Loopwork.

## Overview

The subagent system enables Loopwork to spawn specialized AI agents for different tasks, parse their structured outputs, and manage execution state for resumption. It follows clean architecture principles with dependency injection and comprehensive test coverage.

## Package Structure

```
packages/
├── agents/           # @loopwork-ai/agents - Agent definitions and execution
├── result-parser/    # @loopwork-ai/result-parser - Output parsing
├── checkpoint/       # @loopwork-ai/checkpoint - State persistence
└── loopwork/         # Core package with adapters and integration
```

## Package: @loopwork-ai/agents

Agent definitions, registry, and execution infrastructure.

### Key Types

```typescript
import {
  // Types
  AgentDefinition,
  AgentDefinitionInput,
  ValidationResult,
  IAgentFactory,
  IAgentRegistry,
  IAgentExecutor,
  IPromptBuilder,
  ICliRunner,
  CliRunOptions,
  CliRunResult,
  ExecutionContext,
  ExecutionResult,

  // Classes
  AgentFactory,
  AgentRegistry,
  AgentExecutor,
  AgentPromptBuilder,

  // Factories
  createAgentExecutor,
  createAgentRegistry,
} from '@loopwork-ai/agents'
```

### AgentDefinition

Immutable configuration for an agent:

```typescript
interface AgentDefinition {
  readonly name: string           // Unique identifier (e.g., 'code-reviewer')
  readonly description: string    // When to use this agent
  readonly prompt: string         // System prompt prepended to task
  readonly tools?: readonly string[]  // Allowed tools (undefined = all)
  readonly model?: 'sonnet' | 'opus' | 'haiku' | string
  readonly env?: Readonly<Record<string, string>>
  readonly timeout?: number       // Timeout in seconds
}
```

### Usage Example

```typescript
import { createAgentRegistry, createAgentExecutor } from '@loopwork-ai/agents'

// Create registry and register agents
const registry = createAgentRegistry()
registry.register({
  name: 'code-reviewer',
  description: 'Reviews code for quality, security, and best practices',
  prompt: 'You are an expert code reviewer. Analyze the code and provide feedback.',
  model: 'sonnet',
})
registry.setDefault('code-reviewer')

// Create executor with CLI runner
const executor = createAgentExecutor()

// Execute agent against task
const result = await executor.execute(
  registry.get('code-reviewer')!,
  task,
  {
    cliRunner: myCliRunner,
    workDir: '/path/to/project',
    timeout: 300,
  }
)
```

## Package: @loopwork-ai/result-parser

Parses CLI output into structured results.

### Key Types

```typescript
import {
  // Types
  SubagentResult,
  Artifact,
  TaskSuggestion,
  ResultMetrics,
  ParseContext,
  IGitRunner,
  ISubParser,
  IResultParser,

  // Classes
  StatusParser,
  ArtifactDetector,
  TaskSuggestionParser,
  MetricsExtractor,
  CompositeResultParser,

  // Factories
  createResultParser,
} from '@loopwork-ai/result-parser'
```

### SubagentResult

Structured result from agent execution:

```typescript
interface SubagentResult {
  status: 'success' | 'failure' | 'partial'
  summary: string
  artifacts: Artifact[]      // Files created/modified/deleted
  followUpTasks: TaskSuggestion[]  // Suggested next tasks
  metrics: ResultMetrics     // Duration, tokens, tool calls
  rawOutput: string          // Original output
}
```

### Usage Example

```typescript
import { createResultParser } from '@loopwork-ai/result-parser'

const parser = createResultParser()

const result = await parser.parse(cliOutput, {
  workDir: '/path/to/project',
  exitCode: 0,
  durationMs: 5000,
  gitRunner: myGitRunner,  // Optional - enables artifact detection
})

console.log(result.status)       // 'success'
console.log(result.artifacts)    // [{ path: 'src/file.ts', action: 'modified' }]
console.log(result.followUpTasks) // [{ title: 'Add tests', ... }]
```

### Pattern Detection

The parser detects various patterns in CLI output:

- **TODO:** / **NEXT:** / **FOLLOWUP:** - Extracted as follow-up tasks
- **JSON blocks** - Parsed for structured task suggestions
- **Token counts** - `Tokens: 1234` or `tokens_used: 1234`
- **Tool calls** - `Tool calls: 5` patterns

## Package: @loopwork-ai/checkpoint

Agent state persistence and resumption.

### Key Types

```typescript
import {
  // Types
  AgentCheckpoint,
  RestoredContext,
  CheckpointEvent,
  IFileSystem,
  ICheckpointStorage,
  ICheckpointManager,

  // Classes
  FileCheckpointStorage,
  CheckpointManager,
  NodeFileSystem,

  // Factories
  createCheckpointManager,
} from '@loopwork-ai/checkpoint'
```

### AgentCheckpoint

Captures execution state for resumption:

```typescript
interface AgentCheckpoint {
  agentId: string
  taskId: string
  agentName: string
  iteration: number
  timestamp: Date
  lastToolCall?: string
  phase: 'started' | 'executing' | 'completed' | 'failed' | 'interrupted'
  state?: Record<string, unknown>  // Custom state data
}
```

### Usage Example

```typescript
import { createCheckpointManager } from '@loopwork-ai/checkpoint'

const manager = createCheckpointManager({
  basePath: '.loopwork/agents',
})

// Create checkpoint during execution
await manager.onEvent(agentId, { type: 'execution_start', taskId, agentName })
await manager.onEvent(agentId, { type: 'tool_call', toolName: 'Read' })
await manager.onEvent(agentId, { type: 'iteration', iteration: 5 })

// Restore after interrupt
const context = await manager.restore(agentId)
if (context) {
  console.log(context.checkpoint.iteration)  // 5
  console.log(context.partialOutput)         // Accumulated output
}

// Clean up old checkpoints
const deleted = await manager.storage.cleanup(7)  // Remove > 7 days old
```

## Integration with Loopwork Core

### Adapters

The core package provides adapters to bridge existing infrastructure:

```typescript
import { CliRunnerAdapter, GitRunnerAdapter } from 'loopwork/adapters'

// Wrap existing CliExecutor
const cliRunner = new CliRunnerAdapter(existingCliExecutor)

// Create git runner for artifact detection
const gitRunner = new GitRunnerAdapter('/path/to/project')
```

### Re-exports

All subagent types are re-exported from the main loopwork package:

```typescript
import {
  // From @loopwork-ai/agents (prefixed to avoid conflicts)
  SubagentDefinition,
  SubagentRegistry,
  SubagentExecutor,
  createSubagentRegistry,
  createSubagentExecutor,

  // From @loopwork-ai/result-parser
  SubagentResult,
  createResultParser,

  // From @loopwork-ai/checkpoint
  AgentCheckpoint,
  createCheckpointManager,

  // Adapters
  CliRunnerAdapter,
  GitRunnerAdapter,
} from 'loopwork'
```

## Dependency Injection

All components use constructor injection for testability:

```typescript
// ICliRunner - inject mock for testing
const mockRunner: ICliRunner = {
  async run(options) {
    return { exitCode: 0, output: 'mock', durationMs: 100, timedOut: false }
  }
}

// IFileSystem - inject mock for checkpoint testing
const mockFs: IFileSystem = {
  async readFile(path) { return mockData.get(path) ?? '' },
  async writeFile(path, content) { mockData.set(path, content) },
  // ... etc
}

// IGitRunner - inject mock for result parsing
const mockGit: IGitRunner = {
  async diff(args) { return 'M\tsrc/file.ts' },
  async status() { return '?? new-file.ts' },
}
```

## Testing Strategy

### Unit Tests
- Pure functions tested in isolation
- Mock all dependencies via DI
- Located in `test/unit/`

### Integration Tests
- Test component interactions
- Use real implementations with mock external services
- Located in `test/integration/`

### E2E Tests
- Full workflow from config to execution
- Located in `test/e2e/`

## File Locations

```
.loopwork/
├── agents/
│   └── {agentId}/
│       ├── context.json    # Checkpoint data
│       └── output.log      # Accumulated output
├── state.json              # Session state
└── runs/                   # Historical run logs
```

## Test Coverage

| Package | Tests | Coverage |
|---------|-------|----------|
| @loopwork-ai/agents | 48 | Unit, Integration, E2E |
| @loopwork-ai/result-parser | 35 | Unit, Integration, Fixtures |
| @loopwork-ai/checkpoint | 23 | Unit, Integration, E2E |
| loopwork (integration) | 19 | Integration, Adapters |

**Total: 125 tests**

## Future Extensions

1. **MCP Tools** - Add `spawn-subagent` and `resume-agent` tools
2. **Config Integration** - Load agents from `loopwork.config.ts`
3. **Run Command** - Use agents from task metadata
4. **Parallel Execution** - Run multiple agents concurrently
