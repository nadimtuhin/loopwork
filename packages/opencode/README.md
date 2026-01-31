# @loopwork-ai/opencode

OpenCode integration for Loopwork - automatic model discovery and configuration.

## Features

- **Auto-Discovery**: Automatically discovers available OpenCode models
- **Smart Filtering**: Filter by provider, exclude specific models
- **Zero Configuration**: Works out of the box with sensible defaults
- **Provider Helpers**: Pre-configured helpers for major providers

## Installation

```bash
bun add @loopwork-ai/opencode
```

## Quick Start

### Auto-Discover All Models

```typescript
import { compose, defineConfig, withJSONBackend } from 'loopwork'
import { withOpenCode } from '@loopwork-ai/opencode'

export default compose(
  withJSONBackend({ tasksFile: 'tasks.json' }),
  withOpenCode() // Discovers all available models
)(defineConfig({ maxIterations: 100 }))
```

### Filter by Provider

```typescript
import { withOpenCode } from '@loopwork-ai/opencode'

export default compose(
  withJSONBackend(),
  withOpenCode({
    providers: ['google', 'anthropic'], // Only Google and Anthropic models
    defaultTimeout: 300
  })
)(defineConfig({ maxIterations: 100 }))
```

### Use Provider Helpers

```typescript
import { OpenCodeProviders } from '@loopwork-ai/opencode'

export default compose(
  withJSONBackend(),
  OpenCodeProviders.google(), // Only Google Gemini models
  OpenCodeProviders.anthropic() // Add Anthropic Claude models
)(defineConfig({ maxIterations: 100 }))
```

## API

### `withOpenCode(options?)`

Main plugin for OpenCode integration.

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `autoDiscover` | `boolean` | `true` | Auto-discover models via `opencode models` |
| `providers` | `string[]` | `[]` | Filter by provider (e.g., `['google', 'anthropic']`) |
| `exclude` | `string[]` | `[]` | Exclude specific model IDs |
| `defaultTimeout` | `number` | `300` | Default timeout in seconds |
| `selectionStrategy` | `string` | `'round-robin'` | Model selection strategy |

### Provider Helpers

Pre-configured helpers for common providers:

```typescript
OpenCodeProviders.google()        // Google Gemini models
OpenCodeProviders.anthropic()     // Anthropic Claude models
OpenCodeProviders.openrouter()    // OpenRouter models
OpenCodeProviders.githubCopilot() // GitHub Copilot models
OpenCodeProviders.opencode()      // OpenCode native models
OpenCodeProviders.cerebras()      // Cerebras models
OpenCodeProviders.zai()           // ZAI models
```

### Utility Functions

#### `discoverOpenCodeModels(): string[]`

Discovers available models by running `opencode models`.

```typescript
import { discoverOpenCodeModels } from '@loopwork-ai/opencode'

const models = discoverOpenCodeModels()
// ['google/gemini-2.5-flash', 'anthropic/claude-sonnet-4-5', ...]
```

#### `createOpenCodeModel(modelId, options): ModelConfig`

Converts an OpenCode model ID to Loopwork ModelConfig.

```typescript
import { createOpenCodeModel } from '@loopwork-ai/opencode'

const model = createOpenCodeModel('google/gemini-2.5-flash', { timeout: 300 })
// { name: 'gemini-2.5-flash', cli: 'opencode', model: 'google/gemini-2.5-flash', timeout: 300 }
```

## Available Providers

Based on OpenCode model discovery (259 total models):

| Provider | Count | Example Models |
|----------|-------|----------------|
| `openrouter` | 148 | DeepSeek, Mistral, Qwen, Llama |
| `google` | 31 | Gemini 2.5 Flash/Pro, Antigravity |
| `opencode` | 29 | GPT-5, Claude, Gemini (native) |
| `anthropic` | 21 | Claude 3.5/4/4.5 Opus/Sonnet/Haiku |
| `github-copilot` | 19 | Claude, Gemini, GPT-5 |
| `zai-coding-plan` | 8 | GLM 4.5/4.6/4.7 |
| `cerebras` | 3 | GPT-OSS, Qwen, GLM |

## Examples

### Budget-Conscious: Free Models Only

```typescript
withOpenCode({
  providers: ['openrouter'],
  // Include only :free models (filtering logic TBD)
})
```

### High-Performance: Best Models

```typescript
withOpenCode({
  providers: ['google', 'anthropic'],
  exclude: [
    'google/gemini-embedding-001', // Exclude embedding models
  ],
  defaultTimeout: 600 // Longer timeout for complex tasks
})
```

### Mixed Strategy

```typescript
import { compose } from 'loopwork'
import { OpenCodeProviders } from '@loopwork-ai/opencode'

export default compose(
  withJSONBackend(),
  OpenCodeProviders.google(), // Primary: Google models
  OpenCodeProviders.anthropic(), // Fallback: Anthropic
  withCli({
    fallbackModels: [/* manual fallbacks */],
    selectionStrategy: 'cost-aware'
  })
)(defineConfig({ maxIterations: 100 }))
```

## Requirements

- OpenCode CLI installed and configured
- Models must be accessible via `opencode models` command
- Proper authentication for non-free models

## Troubleshooting

### No models discovered

```bash
# Check if opencode CLI is installed
which opencode

# Verify models are available
opencode models

# Check authentication
opencode auth status
```

### Models failing at runtime

- Increase `defaultTimeout` for slow models
- Check OpenCode rate limits
- Verify model authentication/access

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Build
bun run build
```

## License

MIT
