# Migration Guide: Output System

This guide helps you migrate from the legacy string-based output utilities to the new Ink-based React component system.

## Overview

Loopwork provides an Ink-based TUI (Terminal User Interface) system for rich, interactive output. The legacy string-based output utilities in `src/core/output.ts` are deprecated.

## Component Library

### Available Components

| Component | Description | Import |
|-----------|-------------|--------|
| `Banner` | Bordered announcement boxes with key-value rows | `loopwork/components` |
| `ProgressBar` | Deterministic progress bars and indeterminate spinners | `loopwork/components` |
| `Table` | Unicode box-drawing tables with alignment | `loopwork/components` |
| `CompletionSummary` | Task completion statistics and next steps | `loopwork/components` |
| `InkBanner` | Ink-specific banner component | `loopwork/components` |
| `InkTable` | Ink-specific table component | `loopwork/components` |
| `InkLog` | Log display component | `loopwork/components` |
| `InkSpinner` | Animated spinner component | `loopwork/components` |
| `InkStream` | Stream output component | `loopwork/components` |
| `InkCompletionSummary` | Ink completion summary | `loopwork/components` |

### Usage Example

```typescript
import { Banner, ProgressBar, Table, CompletionSummary } from 'loopwork'

// Use in React/Ink context
<Banner 
  title="Task Complete" 
  rows={[{key: 'Duration', value: '5m'}]} 
/>

<ProgressBar current={75} total={100} width={30} />

<Table 
  headers={['ID', 'Status', 'Priority']}
  rows={[
    ['TASK-001', 'Completed', 'High'],
    ['TASK-002', 'In Progress', 'Medium']
  ]}
/>

<CompletionSummary 
  completed={5} 
  failed={1} 
  duration={120000}
/>
```

## Output Modes

Loopwork supports multiple output modes:

| Mode | Description | Use Case |
|------|-------------|----------|
| `ink` | React-based TUI with rich interactive display | Interactive terminal sessions |
| `human` | Console output with colors and formatting | Development and debugging |
| `json` | Structured JSON events for parsing | CI/CD pipelines and automation |
| `silent` | Suppress all output | Headless environments |

### Configuring Output Mode

```typescript
import { defineConfig, compose } from 'loopwork'

export default compose(
  // ... other plugins
)(defineConfig({
  // Output mode: 'ink' | 'json' | 'silent' | 'human'
  outputMode: 'ink',
  
  // Minimum log level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent'
  logLevel: 'info',
  
  // Enable/disable colors
  useColor: true,
  
  // Force TTY mode (auto-detected by default)
  useTty: true,
}))
```

## Migration from Legacy Output

### Before (Legacy)

```typescript
import { output } from 'loopwork/core'

// String-based output
output.banner('Task Complete', [
  { key: 'Duration', value: '5m' }
])

output.progress(75, 100)
```

### After (Ink Components)

```typescript
import { Banner, ProgressBar } from 'loopwork'

// React component-based output
<Banner 
  title="Task Complete" 
  rows={[{key: 'Duration', value: '5m'}]} 
/>

<ProgressBar current={75} total={100} />
```

## Renderer System

The output system uses a renderer pattern:

```typescript
import { InkRenderer, ConsoleRenderer } from 'loopwork/output'

// Ink renderer for TTY environments
const inkRenderer = new InkRenderer({
  mode: 'ink',
  logLevel: 'info',
  useTty: true
})

// Console renderer for non-TTY environments  
const consoleRenderer = new ConsoleRenderer({
  mode: 'human',
  logLevel: 'info'
})
```

## Testing Components

Use `ink-testing-library` for testing components:

```typescript
import { render } from 'ink-testing-library'
import { Banner } from 'loopwork'

test('should render title', () => {
  const { lastFrame } = render(<Banner title="Test Title" />)
  expect(lastFrame()).toContain('Test Title')
})
```

## Event System

The output system emits events for external subscribers:

```typescript
import { InkRenderer } from 'loopwork/output'

const renderer = new InkRenderer(config)

renderer.subscribe((event) => {
  switch (event.type) {
    case 'task:start':
      console.log('Task started:', event.taskId)
      break
    case 'task:complete':
      console.log('Task completed:', event.taskId)
      break
  }
})
```

## Best Practices

1. **Use Ink components for new code** - The component library is the recommended approach
2. **Migrate incrementally** - Legacy output still works during migration
3. **Test in both TTY and non-TTY modes** - Ensure components render correctly in both environments
4. **Use ink-testing-library for unit tests** - Provides proper testing utilities for Ink components
5. **Handle cleanup properly** - Ink components manage their own cleanup when unmounted

## Troubleshooting

### Raw Mode Error

If you see "Raw mode is not supported", the environment doesn't support TTY. The renderer automatically falls back to console output.

### Terminal Size

Ink components require minimum 80x24 terminal size for optimal display.

### Unicode Support

Ensure your terminal supports Unicode characters for proper box-drawing rendering.

## Further Reading

- [Ink Documentation](https://github.com/vadimdemedes/ink)
- [React Documentation](https://reactjs.org/)
- [Output System Architecture](../explanation/output-system.md)
