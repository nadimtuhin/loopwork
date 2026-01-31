# Cost-Aware Model Selection Bug Fix

## The Problem

When running loopwork with `--config loopwork.config.ts`, the cost-aware model selection was being ignored and the system was falling back to default models (Claude Sonnet) even though the config file specified 13 free models with `costWeight: 5` and `selectionStrategy: "cost-aware"`.

## Root Cause

The bug was in `packages/loopwork/src/core/config.ts` in the `loadConfigFile()` function.

When `--config loopwork.config.ts` was passed as a CLI flag, the code was treating the config FILE PATH as a DIRECTORY:

```typescript
// Before fix - treated config path as directory
const fileConfig = await loadConfigFile(options.config ? path.resolve(options.config) : projectRoot)

// Inside loadConfigFile(), it would do:
const configPaths = [
  path.join(projectRoot, 'loopwork.config.ts'),  // Resulted in: loopwork.config.ts/loopwork.config.ts
  path.join(projectRoot, 'loopwork.config.js'),
  path.join(projectRoot, 'loopwork.config.mjs'),
]
```

This created an invalid path like `/path/to/loopwork.config.ts/loopwork.config.ts`, which didn't exist, so no config was loaded, and `cliConfig` was undefined.

## The Fix

Added a check at the start of `loadConfigFile()` to detect if the parameter is a file (from `--config` flag) rather than a directory:

```typescript
async function loadConfigFile(projectRoot: string): Promise<Partial<LoopworkFileConfig> | null> {
  // If projectRoot is actually a file path (from --config flag), use it directly
  if (fs.existsSync(projectRoot) && fs.statSync(projectRoot).isFile()) {
    const configPath = projectRoot
    try {
      const module = await import(configPath)
      const config = module.default || module
      return config
    } catch (e: unknown) {
      throw e
    }
  }

  // Original directory-based logic continues...
  const configPaths = [
    path.join(projectRoot, 'loopwork.config.ts'),
    path.join(projectRoot, 'loopwork.config.js'),
    path.join(projectRoot, 'loopwork.config.mjs'),
  ]
  ...
}
```

## Verification

After the fix:
- ✅ Config file with `cliConfig` is loaded correctly
- ✅ 13 models are registered (9 free with costWeight: 5, 4 paid with costWeight: 10-30)
- ✅ Selection strategy is `cost-aware`
- ✅ First model selected is `deepseek-r1` (costWeight: 5) instead of Claude Sonnet (costWeight: 30)
- ✅ System correctly cycles through free models first before trying paid ones

## Files Changed

- `packages/loopwork/src/core/config.ts` - Added file path detection in `loadConfigFile()`
