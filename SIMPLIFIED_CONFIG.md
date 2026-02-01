# Simplified Configuration for Loopwork

The new simplified configuration API makes it **much easier** to get started with Loopwork while maintaining **100% backward compatibility** with existing configs.

## Quick Comparison

### Before (Complex)
```typescript
import {
  defineConfig,
  compose,
  withJSONBackend,
  withCli,
  withGitAutoCommit,
  withSmartTestTasks,
  withTaskRecovery,
  ModelPresets,
  createModel,
} from "@loopwork-ai/loopwork";
import { withCostTracking } from "@loopwork-ai/cost-tracking";

export default compose(
  withJSONBackend({ tasksFile: ".specs/tasks/tasks.json" }),
  withCli({
    models: [
      ModelPresets.claudeSonnet({ timeout: 600 }),
      createModel({
        name: "gemini-flash",
        cli: "opencode",
        model: "google/antigravity-gemini-3-flash",
        timeout: 600,
        costWeight: 15,
      }),
    ],
    fallbackModels: [
      ModelPresets.claudeOpus({ timeout: 900 }),
    ],
    selectionStrategy: "cost-aware",
  }),
  withCostTracking({ enabled: true }),
  withGitAutoCommit({ enabled: true }),
  withSmartTestTasks({ enabled: true, autoCreate: false }),
  withTaskRecovery({ enabled: true, autoRecover: true }),
)(defineConfig({
  parallel: 3,
  maxIterations: 50,
}));
```

### After (Simple)
```typescript
import { defineSimpleConfig } from "@loopwork-ai/loopwork";

export default defineSimpleConfig({
  models: ["claude-sonnet", "gemini-flash"],
  parallel: 3,
  autoCommit: true,
  smartTests: true,
  taskRecovery: true,
});
```

**90% less code**, same functionality!

## New API Reference

### `defineSimpleConfig(options)`

The easiest way to configure Loopwork.

```typescript
import { defineSimpleConfig } from "@loopwork-ai/loopwork";

export default defineSimpleConfig({
  // Required: Models to use (with automatic fallback)
  models: ["claude-sonnet", "gemini-flash"],
  
  // Optional: Fallback models for retries
  fallbackModels: ["claude-opus"],
  
  // Optional: Backend (string path or object)
  backend: ".specs/tasks/tasks.json", // or { type: "github", repo: "owner/repo" }
  
  // Optional: Parallel workers (default: 1)
  parallel: 3,
  
  // Optional: Max iterations (default: 50)
  maxIterations: 100,
  
  // Optional: Timeout per task in seconds (default: 600)
  timeout: 300,
  
  // Optional: Features (all default to false)
  autoCommit: true,      // Auto-commit after each task
  smartTests: true,      // Suggest test tasks
  taskRecovery: true,    // Auto-recover from failures
  changelog: true,       // Update CHANGELOG.md
  
  // All other LoopworkConfig options work too
  namespace: "my-project",
  debug: true,
});
```

### Model Shortcuts

Use simple names instead of complex `createModel()` calls:

| Shortcut | Maps To |
|----------|---------|
| `"claude-sonnet"` | Claude Sonnet (balanced) |
| `"claude-opus"` | Claude Opus (premium) |
| `"claude-haiku"` | Claude Haiku (fast) |
| `"gemini-flash"` | Gemini Flash (fast/cheap) |
| `"gemini-pro"` | Gemini Pro (capable) |
| `"fast"` | Same as `gemini-flash` |
| `"cheap"` | Same as `gemini-flash` |
| `"balanced"` | Same as `claude-sonnet` |
| `"premium"` | Same as `claude-opus` |
| `"opencode/model-name"` | Custom OpenCode model |

### Presets

Start from a preset and customize:

```typescript
import { createPresetConfig, Presets } from "@loopwork-ai/loopwork";

// Use a preset
export default createPresetConfig(Presets.fastAndCheap);

// Or customize a preset
export default createPresetConfig(Presets.balanced, {
  parallel: 5,
  autoCommit: true,
});
```

Available presets:

- **`Presets.fastAndCheap`** - Fast, low-cost models for quick iterations
- **`Presets.balanced`** - Good mix of capability and cost (recommended)
- **`Presets.highQuality`** - Premium models for complex tasks
- **`Presets.freeTier`** - Uses only free models
- **`Presets.parallel`** - Optimized for parallel execution

### `defineEasyConfig()` - Middle Ground

If you need more control than `defineSimpleConfig` but want simpler model configuration:

```typescript
import { defineEasyConfig } from "@loopwork-ai/loopwork";

export default defineEasyConfig({
  models: ["claude-sonnet", "gemini-flash"],
  backend: ".specs/tasks/tasks.json",
  parallel: 3,
  // All LoopworkConfig options available
  maxRetries: 5,
  circuitBreakerThreshold: 3,
});
```

## Migration Guide

### Existing configs continue to work

Your current config using `compose()` and `defineConfig()` will continue to work forever. These new helpers are **additive only**.

### Gradual Migration

You can migrate gradually:

```typescript
// Old way still works
import { compose, defineConfig, withJSONBackend, withCli } from "@loopwork-ai/loopwork";

// New way for simple cases
import { defineSimpleConfig } from "@loopwork-ai/loopwork";
```

### Full Migration Example

**Before:**
```typescript
import {
  defineConfig,
  compose,
  withJSONBackend,
  withCli,
  ModelPresets,
  createModel,
} from "@loopwork-ai/loopwork";

export default compose(
  withJSONBackend({ tasksFile: ".specs/tasks/tasks.json" }),
  withCli({
    models: [
      ModelPresets.claudeSonnet({ timeout: 600 }),
      createModel({
        name: "gemini-flash",
        cli: "opencode",
        model: "google/antigravity-gemini-3-flash",
        timeout: 600,
        costWeight: 15,
      }),
    ],
    selectionStrategy: "cost-aware",
  }),
)(defineConfig({
  parallel: 2,
}));
```

**After:**
```typescript
import { defineSimpleConfig } from "@loopwork-ai/loopwork";

export default defineSimpleConfig({
  models: ["claude-sonnet", "gemini-flash"],
  parallel: 2,
});
```

## Advanced Usage

When you need the full power of the compose pattern, it's still available:

```typescript
import {
  defineConfig,
  compose,
  withJSONBackend,
  withCli,
  withPlugin,
  ModelPresets,
} from "@loopwork-ai/loopwork";
import { withCostTracking } from "@loopwork-ai/cost-tracking";
import { withTelegram } from "@loopwork-ai/telegram";

// Custom plugin
const myPlugin = withPlugin({
  name: "custom",
  onTaskComplete: (context, result) => {
    console.log(`Task ${context.task.id} completed!`);
  },
});

export default compose(
  withJSONBackend({ tasksFile: ".specs/tasks/tasks.json" }),
  withCli({
    models: [ModelPresets.claudeSonnet()],
  }),
  withCostTracking({ dailyBudget: 50 }),
  withTelegram({ botToken: process.env.TELEGRAM_BOT_TOKEN }),
  myPlugin,
)(defineConfig({
  parallel: 3,
}));
```

## Summary

| Use Case | Recommended API |
|----------|-----------------|
| Quick start, simple needs | `defineSimpleConfig()` |
| Start from best practices | `createPresetConfig()` |
| Middle ground | `defineEasyConfig()` |
| Full control, custom plugins | `compose()` + `defineConfig()` |

The new APIs make Loopwork accessible to beginners while preserving all power for advanced users. **All existing configs remain valid and functional.**
