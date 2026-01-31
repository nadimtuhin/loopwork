# Config Hot Reload

This document describes Loopwork's configuration hot reload feature, which allows configuration changes to be applied without restarting the process.

## Overview

Config hot reload monitors your `loopwork.config.ts` or `loopwork.config.js` file and automatically reloads configuration when changes are detected. This enables:

- **Live configuration updates** - Change settings without stopping Loopwork
- **Development efficiency** - Iterate on config quickly
- **Event-driven reactivity** - Plugins and custom code can react to config changes
- **Graceful error handling** - Invalid configs don't crash the process

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                     loopwork start                        │
│              (with --hot-reload flag)                   │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
         ┌────────────────────────┐
         │  getConfig() called  │
         │  hotReload: true    │
         └─────────┬──────────┘
                   │
                   ▼
    ┌──────────────────────────────┐
    │ ConfigHotReloadManager    │
    │   .start(configPath)    │
    └──────────┬───────────────┘
               │
               ▼
    ┌──────────────────────────────┐
    │  chokidar.watch()       │◄─── Config file saved
    │  File watcher active      │
    └──────────┬───────────────┘
               │
               │ [Change detected]
               │
               ▼
    ┌──────────────────────────────┐
    │  reloadConfig()          │
    │  1. Clear cache        │
    │  2. Re-import module   │
    │  3. Validate config     │
    └──────────┬───────────────┘
               │
               │
        ┌──────┴──────┐
        │             │
     Valid         Invalid
        │             │
        ▼             ▼
   ┌────────┐   ┌──────────────┐
   │ Apply  │   │ Keep old    │
   │ emit   │   │ Log error    │
   │ event  │   └──────────────┘
   └────────┘
```

## Enabling Hot Reload

### Method 1: CLI Flag

```bash
loopwork start --hot-reload
```

### Method 2: Environment Variable

```bash
export LOOPWORK_HOT_RELOAD=true
loopwork start
```

### Method 3: Daemon Mode

```bash
# Start daemon with hot reload
loopwork start -d --hot-reload --namespace prod

# Config changes are now hot-reloaded without stopping the daemon
```

### Permanently Enable (Shell Profile)

Add to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.):

```bash
# Always enable hot reload
export LOOPWORK_HOT_RELOAD=true
```

## Configuration Changes That Are Hot-Reloaded

| Config Property | Hot-Reloaded? | Notes |
|----------------|----------------|--------|
| `cli` | ✅ Yes | Switch between claude, opencode, gemini |
| `maxIterations` | ✅ Yes | Adjust iteration limit |
| `timeout` | ✅ Yes | Change task timeout |
| `namespace` | ✅ Yes | Update namespace |
| `backend` | ⚠️ Partial | Some settings work, full reconnect may need restart |
| Plugin configs | ✅ Yes | Most plugin settings update live |
| `logLevel` | ✅ Yes | Change logging verbosity |

## Configuration Changes That Require Restart

| Config Property | Requires Restart | Reason |
|----------------|------------------|---------|
| Adding new plugins | ✅ Yes | Plugins are registered at startup |
| Changing backend type | ✅ Yes | Backend connection is initialized once |
| CLI arguments | ✅ Yes | These are parsed only at start |

## API Reference

### ConfigHotReloadManager

```typescript
class ConfigHotReloadManager {
  /**
   * Start watching config file for changes
   * @param configPath - Absolute path to config file
   * @param initialConfig - Initial config to watch with
   */
  start(configPath: string, initialConfig: Config): void

  /**
   * Stop watching config file
   */
  async stop(): Promise<void>

  /**
   * Get current configuration
   * @returns Current config or null if not started
   */
  getCurrentConfig(): Config | null

  /**
   * Register listener for config reload events
   * @param callback - Function called on config reload
   */
  onReload(callback: (event: ConfigReloadEvent) => void): void

  /**
   * Remove listener for config reload events
   * @param callback - Previously registered callback function
   */
  offReload(callback: (event: ConfigReloadEvent) => void): void

  /**
   * Check if watcher is actively watching
   * @returns true if watching, false otherwise
   */
  isWatching(): boolean
}
```

### ConfigReloadEvent

```typescript
export interface ConfigReloadEvent {
  /** When the config was reloaded */
  timestamp: Date

  /** Path to the config file that changed */
  configPath: string

  /** The new configuration object */
  config: Config
}
```

### Singleton Functions

```typescript
/**
 * Get or create the config hot reload manager
 * @returns Singleton instance of ConfigHotReloadManager
 */
function getConfigHotReloadManager(): ConfigHotReloadManager

/**
 * Reset config hot reload manager (for testing)
 * @internal
 */
function resetConfigHotReloadManager(): void
```

## Usage Examples

### Basic Hot Reload

```bash
# Start with hot reload enabled
loopwork start --hot-reload

# In another terminal, edit config
nano loopwork.config.ts

# Changes are applied automatically
```

### Listening to Reload Events

```typescript
import { getConfigHotReloadManager, type ConfigReloadEvent } from 'loopwork'

const manager = getConfigHotReloadManager()

// Register listener
const onReload = (event: ConfigReloadEvent) => {
  console.log('Config reloaded:', {
    timestamp: event.timestamp,
    configPath: event.configPath,
    newConfig: event.config
  })

  // React to specific config changes
  if (event.config.cli === 'opencode') {
    // Handle OpenCode-specific logic
  }
}

manager.onReload(onReload)

// Later, remove listener
manager.offReload(onReload)
```

### Daemon with Hot Reload

```bash
# Start daemon with hot reload
loopwork start -d --hot-reload --namespace prod

# Edit config
nano loopwork.config.ts

# Daemon continues running with new config
# No restart needed!
```

### Conditional Logic on Reload

```typescript
import { getConfigHotReloadManager } from 'loopwork'

const manager = getConfigHotReloadManager()
let previousTimeout = 600

manager.onReload((event) => {
  const newTimeout = event.config.timeout || 600

  if (newTimeout !== previousTimeout) {
    console.log(`Timeout changed from ${previousTimeout}s to ${newTimeout}s`)

    // Restart services that depend on timeout
    restartTimeoutDependentServices()

    previousTimeout = newTimeout
  }
})
```

## Error Handling

Hot reload includes multiple layers of error handling:

### Module Import Errors

When config file has syntax errors:

```typescript
// Invalid config
module.exports = {
  cli: 'claude'
  missing comma
}
```

**Result:** Old config is preserved, error is logged:

```
[ERROR] Error reloading config: Unexpected token...
[WARN] Reloaded config is invalid, keeping current config
```

### Validation Errors

When config values don't match schema:

```typescript
// Invalid config value
module.exports = {
  maxIterations: -5,  // Cannot be negative
}
```

**Result:** Old config is preserved:

```
[ERROR] Config validation failed: maxIterations must be >= 0
[INFO] Keeping previous valid configuration
```

### File Not Found

When config file doesn't exist:

```bash
loopwork start --hot-reload --config /nonexistent/config.ts
```

**Result:** Hot reload doesn't start, warning is logged:

```
[WARN] Config file not found for hot reload: /nonexistent/config.ts
[INFO] Loopwork running without hot reload
```

### Watcher Errors

When file watcher encounters errors:

```
[ERROR] Config watcher error: EMFILE (too many open files)
```

**Result:** Error is logged, but Loopwork continues running without hot reload.

## Best Practices

### 1. Test Config Changes

Before applying config changes to production:

```bash
# Validate config syntax
bun -c loopwork.config.ts

# Test with dry-run
loopwork start --dry-run --hot-reload
```

### 2. Monitor Logs

Watch for hot reload success/failure:

```bash
# Follow logs
loopwork logs --follow | grep -E "(Config file changed|Config reloaded|Failed to reload)"
```

### 3. Use in Development

Hot reload is most useful for:

- Iterating on configuration values
- Testing different settings
- Debugging config-related issues
- Development environments

### 4. Be Cautious in Production

Consider restart for major config changes:

- Changing backend type
- Adding new plugins
- Architectural config changes

### 5. Know the Limits

Understand what changes require restart vs. what can be hot-reloaded:

| Use Hot Reload | Use Restart |
|---------------|-------------|
| Iterations, timeout, namespace | New plugins, backend type |
| CLI selection, log level | CLI arguments passed at start |
| Most plugin settings | |

## Troubleshooting

### Hot Reload Not Starting

**Problem:** Config changes aren't being detected

**Check:**

1. Verify hot reload is enabled:
   ```bash
   loopwork start --hot-reload --debug
   # Look for: "Config hot reload enabled: /path/to/config"
   ```

2. Verify config file exists:
   ```bash
   ls -la loopwork.config.ts
   ```

3. Check file permissions:
   ```bash
   # Should be readable and writable
   test -r loopwork.config.ts && echo "Readable" || echo "Not readable"
   ```

### Changes Not Applying

**Problem:** Config file changes but old config still active

**Check:**

1. Check file watcher is running:
   ```bash
   loopwork logs --follow | grep "Config file changed"
   # Edit file
   # Should see change detected
   ```

2. Validate new config syntax:
   ```bash
   bun -c loopwork.config.ts
   # Fix any syntax errors
   ```

3. Check for validation errors:
   ```bash
   loopwork logs | grep -i "validation\|invalid"
   ```

### Watcher Errors

**Problem:** Errors from file watcher

**Common errors:**

- `EMFILE` - Too many open files
  - **Fix:** Increase system file limit or reduce watched files

- `EACCES` - Permission denied
  - **Fix:** Check file permissions: `ls -la loopwork.config.ts`

- `ENOENT` - File not found
  - **Fix:** Verify config path exists

### Windows-Specific Issues

**Problem:** Config file locked by another process

**Check:**

1. Close editors or IDEs that might lock the file
2. Use `git status` to see if file is modified
3. Check for antivirus software scanning the file

## Implementation Details

### File Watcher Configuration

```typescript
chokidar.watch(configPath, {
  persistent: true,              // Keep process running
  ignoreInitial: true,           // Don't fire on initial scan
  awaitWriteFinish: {
    stabilityThreshold: 100,       // Wait 100ms for file to stabilize
    pollInterval: 10,             // Check every 10ms
  },
})
```

### Module Cache Clearing

```typescript
// Clear require cache to force re-import
const resolvedPath = path.resolve(configPath)
delete require.cache[require.resolve(resolvedPath)]

// Re-import
const module = await import(resolvedPath)
const fileConfig = module.default || module
```

### Config Merging

On reload, config is merged with:

- CLI options (from initial `getConfig()` call)
- Environment variables
- Default values

This ensures settings passed at startup aren't lost on reload.

## Testing

Hot reload has comprehensive test coverage:

```bash
# Run all hot reload tests
bun test test/integration/config-hot-reload.test.ts

# Test scenarios include:
# - Watching config file
# - Detecting changes
# - Emitting reload events
# - Handling invalid config
# - Preserving CLI options
# - Validation
# - Lifecycle (start/stop)
# - Environment variable configuration
# - Edge cases
```

## Architecture Decisions

| Decision | Rationale |
|----------|------------|
| Singleton pattern | Prevents duplicate watchers on same file |
| Graceful degradation | Invalid configs shouldn't crash process |
| Module cache clearing | Required for dynamic ES module reloading |
| Stability threshold | Prevents spurious reloads from single save |
| Event-driven | Allows external code to react to changes |
| Preserve CLI options | Startup flags shouldn't be lost on reload |

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture overview
- [README.md](../README.md) - User guide
- [config.ts](../src/core/config.ts) - Implementation source

## Changelog

### Version 0.3.0
- ✅ Initial implementation of config hot reload
- ✅ Chokidar-based file watching
- ✅ Event-driven reload notifications
- ✅ Graceful error handling
- ✅ CLI flag and environment variable support
