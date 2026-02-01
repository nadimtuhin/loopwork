# Migration Guide: Legacy Output → Ink Components

**Status:** Deprecated in v5.0.0, to be removed in v6.0.0

---

## 🚨 Overview

The legacy output system in `src/core/output.ts` is being replaced by React-based Ink components. This migration provides better TUI support, state management, and interactive terminal experiences.

### What's Changing

| Legacy Component | New Ink Component | Location |
|:---------------|:----------------|:--------|
| `Table` class | `Table` component | `src/components/Table.tsx` |
| `Banner` class | `Banner` component | `src/components/Banner.tsx` |
| `ProgressBar` class | `ProgressBar` component | `src/components/ProgressBar.tsx` |
| `CompletionSummary` class | `CompletionSummary` component | `src/components/CompletionSummary.tsx` |

**What's Staying:**
- `createJsonOutput()` - JSON wrapping for command output
- `emitJsonEvent()` - Newline-delimited JSON events
- `separator()` - Horizontal separators
- `supportsEmoji()` / `getEmoji()` - Utility functions

---

## 📝 Migration Guide

### 1. Table Component

**Before (Legacy):**
```typescript
import { Table } from 'loopwork/core/output'

const table = new Table(['Name', 'Status', 'Time'])
table.addRow(['Task 1', 'Complete', '5m'])
table.addRow(['Task 2', 'Failed', '2m'])

console.log(table.render())
```

**After (Ink):**
```typescript
import { Table } from 'loopwork/components'

<Table
  headers={['Name', 'Status', 'Time']}
  rows={[
    ['Task 1', 'Complete', '5m'],
    ['Task 2', 'Failed', '2m'],
  ]}
/>
```

**Key Differences:**
- Legacy: Imperative class with string-based rendering
- Ink: React functional component with declarative JSX
- Ink components auto-detect TTY and handle non-TTY environments gracefully

---

### 2. Banner Component

**Before (Legacy):**
```typescript
import { Banner } from 'loopwork/core/output'

const banner = new Banner('Build Complete')
banner.addRow('Duration', '5m 30s')
banner.addRow('Tests', '42 passed')

console.log(banner.render())
```

**After (Ink):**
```typescript
import { Banner } from 'loopwork/components'

<Banner
  title="Build Complete"
  rows={[
    { key: 'Duration', value: '5m 30s' },
    { key: 'Tests', value: '42 passed' },
  ]}
  style="heavy"
  borderColor="cyan"
/>
```

**Key Differences:**
- Legacy: Constructor-based with `addRow()` method
- Ink: Props-based with `rows` array
- Ink supports `style` ('light' | 'heavy') and `borderColor` props

---

### 3. ProgressBar Component

**Before (Legacy):**
```typescript
import { ProgressBar } from 'loopwork/core/output'

const progress = new ProgressBar(100)
progress.increment()
progress.tick('Processing...')
progress.complete('Done!')
```

**After (Ink):**
```typescript
import { ProgressBar } from 'loopwork/components'

// Deterministic mode (with percentage)
<ProgressBar current={75} total={100} width={30} />

// Indeterminate mode (spinner)
<ProgressBar indeterminate message="Loading..." />

// With completion state
<ProgressBar completed message="Done!" />
```

**Key Differences:**
- Legacy: Class with imperative methods (`increment()`, `tick()`, `complete()`)
- Ink: Props-based with automatic state management
- Ink handles TTY/non-TTY detection automatically
- Ink supports both deterministic and indeterminate modes via props

---

### 4. CompletionSummary Component

**Before (Legacy):**
```typescript
import { CompletionSummary } from 'loopwork/core/output'

const summary = new CompletionSummary('Build Complete')
summary.setStats({ completed: 10, failed: 0, skipped: 2 })
summary.setDuration(1800000) // 30 minutes in ms
summary.addNextStep('Run tests with `bun test`')

console.log(summary.render())
```

**After (Ink):**
```typescript
import { CompletionSummary } from 'loopwork/components'

<CompletionSummary
  title="Build Complete"
  stats={{
    completed: 10,
    failed: 0,
    skipped: 2,
  }}
  duration={1800000} // 30 minutes in ms
  nextSteps={[
    'Run tests with `bun test`',
    'Check coverage report',
  ]}
/>
```

**Key Differences:**
- Legacy: Class with setter methods
- Ink: Props-based with all data passed at once
- Ink automatically handles TTY detection and renders appropriate layout

---

## 🔧 Integration with InkRenderer

For custom rendering, use the `InkRenderer` class:

```typescript
import { InkRenderer } from 'loopwork/output'

const renderer = new InkRenderer({
  mode: 'ink',
  useTty: true,
  logLevel: 'info',
})

// Send events to update UI
renderer.render({
  type: 'task:start',
  taskId: 'TASK-001',
  title: 'Implement feature',
  timestamp: Date.now(),
})
```

---

## 📋 Breaking Changes

### Export Path Changes

**Old:**
```typescript
import { Table, Banner, ProgressBar, CompletionSummary } from 'loopwork/core/output'
```

**New:**
```typescript
import { Table, Banner, ProgressBar, CompletionSummary } from 'loopwork/components'
```

### Constructor vs Props

All legacy classes used constructors with methods. All Ink components use props:

| Legacy Pattern | Ink Pattern |
|:-------------|:-----------|
| `new Table(headers).addRow()` | `<Table headers={...} rows={...} />` |
| `new Banner(title).addRow()` | `<Banner title={...} rows={...} />` |
| `new ProgressBar(total).tick()` | `<ProgressBar current={...} total={...} />` |
| `new CompletionSummary(title).setStats()` | `<CompletionSummary title={...} stats={...} />` |

---

## ✅ Checklist

### For Developers Migrating Code

- [ ] Update import statements to use `from 'loopwork/components'`
- [ ] Replace class instantiation with JSX component usage
- [ ] Convert method calls to props (`addRow()` → `rows` prop)
- [ ] Remove `.render()` calls (Ink handles rendering)
- [ ] Test in both TTY and non-TTY environments
- [ ] Verify color rendering in different terminal emulators

### For Library Consumers

- [ ] Check if your package uses legacy `loopwork/core/output` exports
- [ ] Update imports to point to `loopwork/components`
- [ ] Test with your terminal workflow
- [ ] Review deprecation warnings in your IDE

---

## 🐛 Troubleshooting

### "Component not rendering"

**Issue:** Ink component appears but doesn't update

**Solution:** Ensure you're using the component within an Ink-rendered context:
```typescript
import { render } from 'ink'
import { MyComponent } from './MyComponent'

// ✅ Correct: Rendered by Ink
const { unmount } = render(<MyComponent />)

// ❌ Incorrect: Just imported, not rendered
console.log(<MyComponent />)
```

### "Colors not showing"

**Issue:** Output appears plain without colors

**Solution:** Check TTY detection - Ink automatically handles this, but you can force colors:
```typescript
<Box borderColor="cyan">
  <Text color="green">Colored text</Text>
</Box>
```

### "Porting complex logic"

**Issue:** Legacy code had complex conditional rendering logic

**Solution:** Use React hooks for state management:
```typescript
import { useState, useEffect } from 'react'
import { Box, Text } from 'ink'

const MyComponent = () => {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Complex logic here
    setTimeout(() => setLoading(false), 1000)
  }, [])

  return (
    <Box>
      <Text>{loading ? 'Loading...' : 'Complete!'}</Text>
    </Box>
  )
}
```

---

## 📚 Additional Resources

- [Ink Documentation](https://github.com/vadimdemedes/ink)
- [React Hooks](https://react.dev/reference/react)
- [Loopwork Architecture](./ARCHITECTURE.md)
- [Output API Inventory](./output-api-inventory.md)

---

## 🗓 Timeline

| Version | Status |
|:-------|:--------|
| v4.0.0 | Legacy output system marked as deprecated |
| v5.0.0 | Ink components become primary (legacy still functional) |
| v6.0.0 | Legacy output system removed |

---

## 💡 Tips

1. **Start Small:** Migrate one component at a time, test thoroughly
2. **Use TypeScript:** Take advantage of type safety with Ink props
3. **Leverage React Patterns:** Hooks, context, and composition
4. **Test in Real Terminals:** Ensure colors and box-drawing render correctly
5. **Check Accessibility:** Verify your TUI works with screen readers if needed

---

## 👥 Plugin Developer Guide

This section specifically addresses migration for plugin developers who use the output system in their plugins.

### Event Subscription Pattern

Plugins can subscribe to output events to track progress or collect metrics:

**Legacy Pattern (no longer recommended):**
```typescript
// Old way - manual tracking
let currentTask: string | null = null

function onTaskStart(task) {
  currentTask = task.id
  console.log(`Starting: ${task.title}`)
}

function onTaskComplete(task) {
  console.log(`Completed: ${task.title}`)
}
```

**New Event-Based Pattern:**
```typescript
import { InkRenderer, type OutputEvent } from 'loopwork/output'

export function createMyPlugin() {
  let completedCount = 0
  let failedCount = 0

  return {
    name: 'my-output-plugin',

    onConfigLoad(config) {
      // Create renderer to subscribe to events
      const renderer = new InkRenderer({
        mode: config.outputMode || 'ink',
        logLevel: 'info',
        useTty: config.useTty,
      })

      // Subscribe to all events
      renderer.subscribe((event: OutputEvent) => {
        switch (event.type) {
          case 'task:complete':
            completedCount++
            break
          case 'task:failed':
            failedCount++
            break
        }
      })

      return config
    },

    onLoopEnd(stats) {
      // Use collected metrics
      console.log(`Completed: ${completedCount}, Failed: ${failedCount}`)
    },
  }
}
```

### Output Configuration Access

Plugins can read and modify output configuration:

```typescript
export function createMyPlugin() {
  return {
    name: 'output-config-plugin',

    onConfigLoad(config) {
      // Read output settings
      const outputMode = config.outputMode // 'ink' | 'json' | 'human' | 'silent'
      const logLevel = config.logLevel // 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent'
      const useTty = config.useTty

      // Modify configuration
      return {
        ...config,
        outputMode: 'ink', // Force TUI mode
        logLevel: 'debug', // Enable debug logging
      }
    },
  }
}
```

### Rendering Custom Output

Plugins can render custom output using Ink components:

```typescript
import { InkBanner, InkTable } from 'loopwork/components'
import { render } from 'ink'

export function createMyPlugin() {
  return {
    name: 'custom-output-plugin',

    onLoopEnd(stats) {
      // Render custom summary using Ink
      const { unmount } = render(
        <InkBanner
          title="My Plugin Summary"
          rows={[
            { key: 'Tasks', value: String(stats.completed) },
            { key: 'Failures', value: String(stats.failed) },
          ]}
        />
      )

      // Remember to unmount when done
      setTimeout(unmount, 5000)
    },
  }
}
```

### Event Types Reference

Plugins should handle these event types:

```typescript
type OutputEvent =
  | { type: 'log'; level: string; message: string }
  | { type: 'task:start'; taskId: string; title: string }
  | { type: 'task:complete'; taskId: string; duration: number }
  | { type: 'task:failed'; taskId: string; error: string }
  | { type: 'loop:start'; namespace: string; taskCount: number }
  | { type: 'loop:end'; completed: number; failed: number }
  | { type: 'cli:start'; taskId: string; model: string }
  | { type: 'cli:output'; taskId: string; chunk: string }
  | { type: 'cli:complete'; taskId: string; exitCode: number }
  | { type: 'progress:start'; message: string }
  | { type: 'progress:update'; message: string; percent?: number }
  | { type: 'progress:stop'; success?: boolean }
  | { type: 'raw'; content: string }
  | { type: 'json'; eventType: string; data: Record<string, unknown> }
```

### TTY-Aware Plugins

Plugins that render output should handle TTY/non-TTY environments:

```typescript
export function createMyPlugin() {
  return {
    name: 'tty-aware-plugin',

    onTaskStart(context) {
      const isTty = process.stdout.isTTY

      if (isTty) {
        // Use rich TUI output
        console.log(`🎯 Starting: ${context.task.title}`)
      } else {
        // Plain output for CI/headless
        console.log(`[START] ${context.task.title}`)
      }
    },
  }
}
```

### Performance Considerations

When using output in plugins:

1. **Avoid rendering in hot paths** - Rendering is expensive
2. **Use log events** instead of direct console.log for consistency
3. **Subscribe selectively** - Only subscribe to events you need
4. **Unsubscribe when done** - Clean up subscriptions in `onLoopEnd`

```typescript
export function createMyPlugin() {
  return {
    name: 'efficient-plugin',

    onConfigLoad(config) {
      const renderer = new InkRenderer({ mode: config.outputMode, logLevel: 'info' })

      // Only subscribe to needed events
      const unsubscribe = renderer.subscribe((event) => {
        if (event.type === 'task:complete') {
          // Process completion events
        }
      })

      return config
    },

    onLoopEnd() {
      // Clean up
      unsubscribe()
    },
  }
}
```

### Migration Checklist for Plugin Developers

- [ ] Update imports from `loopwork/core/output` to `loopwork/output`
- [ ] Replace direct console output with event emission
- [ ] Use Ink components for rich TUI output
- [ ] Handle TTY detection for conditional output
- [ ] Clean up subscriptions in plugin lifecycle hooks
- [ ] Test in both interactive and headless environments
- [ ] Verify color rendering works across terminal emulators
