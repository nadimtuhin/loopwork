# @loopwork-ai/visualizer

Visualizer package for Loopwork that provides reporting and visualization capabilities.

## Features

- **Static Reporting**: Generate Markdown and PDF reports of task execution.
- **Task Visualization**: (Coming Soon) Render task dependency graphs and execution timelines.

## Installation

```bash
bun add @loopwork-ai/visualizer
```

## Usage

### Reporting Plugin

Enable the reporting plugin in your `loopwork.config.ts`:

```typescript
import { compose, defineConfig } from 'loopwork'
import { withReporting } from '@loopwork-ai/visualizer'

export default compose(
  withReporting({
    enabled: true,
    format: 'both', // 'markdown', 'pdf', or 'both'
    outputPath: '.loopwork/reports',
  }),
  // ... other plugins
)(defineConfig({
  // ...
}))
```

## Reporting Options

| Option | Description | Default |
| :--- | :--- | :--- |
| `enabled` | Enable/disable the reporting plugin | `true` |
| `format` | Output format: `markdown`, `pdf`, or `both` | `both` |
| `outputPath` | Directory where reports will be saved | `.loopwork/reports` |
| `includeTasks` | Whether to include detailed task information | `true` |
| `includeStats` | Whether to include execution statistics | `true` |
| `includeCost` | Whether to include cost information | `true` |

## License

MIT
