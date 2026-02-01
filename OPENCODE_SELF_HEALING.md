# OpenCode Self-Healing

Loopwork now includes automatic self-healing for OpenCode CLI issues. When OpenCode fails due to missing dependencies or corrupted cache, Loopwork can automatically detect and repair the issue.

## How It Works

When a task fails with an OpenCode-related error, the self-healing system:

1. **Detects** the specific issue (missing `zod`, cache corruption, etc.)
2. **Categorizes** it as an OpenCode dependency or cache problem
3. **Attempts** automatic repair:
   - Installs missing dependencies in the appropriate location
   - Rebuilds corrupted cache
4. **Retries** the task after repair

## Automatic Repair

### Missing Dependencies

When Loopwork detects errors like:
```
Cannot find package 'zod' from '/Users/.../.cache/opencode'
```

It will automatically:
1. Add the missing package to `~/.cache/opencode/package.json`
2. Run `bun install` in the cache directory
3. Verify the installation

### Cache Corruption

When Loopwork detects cache corruption:
```
Cache corruption detected in /Users/.../.cache/opencode
```

It will automatically:
1. Back up the existing cache
2. Create a fresh cache with proper dependencies
3. Install all required packages
4. Clean up the backup on success

## Integration with Circuit Breaker

OpenCode issues integrate with the existing circuit breaker and self-healing system:

```
03:52:49 ❌ ERROR: [CircuitBreaker] Model antigravity-claude-sonnet-4-5 disabled after 3 failures
03:52:49 🔄 Self-Healing Activated
03:52:49    OpenCode dependency issues detected (3/3 failures). Attempting to repair installation
03:52:50 [OpencodeHealer] Installing missing dependency in cache: zod
03:52:51 ✓ [OpencodeHealer] Successfully installed zod in cache
03:52:51 ✓ Self-healing completed successfully
03:52:52 ℹ️ INFO: Resuming task execution...
```

## Manual Repair

If automatic healing fails, you can manually repair OpenCode:

```bash
# Clear and rebuild cache
rm -rf ~/.cache/opencode/

# Or use the programmatic API
npx ts-node -e "
import { attemptOpencodeSelfHealing } from '@loopwork-ai/loopwork';
await attemptOpencodeSelfHealing(\"Cannot find package 'zod'\");
"
```

## Configuration

Self-healing is enabled by default when using parallel execution. The system will attempt to heal up to 3 times before giving up.

To customize self-healing behavior:

```typescript
// loopwork.config.ts
export default defineConfig({
  parallel: 3,
  // Self-healing is automatic, but you can adjust these:
  circuitBreakerThreshold: 5,  // Failures before triggering
  selfHealingCooldown: 30000,   // Wait 30s between healing attempts
})
```

## Detection Patterns

The system detects these OpenCode issues:

| Pattern | Issue Type | Auto-Fix |
|---------|------------|----------|
| `Cannot find package 'zod'` | Missing dependency | ✅ Yes |
| `Cannot find module 'zod'` | Missing dependency | ✅ Yes |
| `Cannot resolve 'zod'` | Missing dependency | ✅ Yes |
| `Cache corruption detected` | Corrupted cache | ✅ Yes |
| `ENOENT` + `cache` | Cache corruption | ✅ Yes |
| `Cannot find package '@opencode-ai/plugin'` | Main installation issue | ✅ Yes |

## API

### Programmatic Usage

```typescript
import {
  detectOpencodeIssues,
  isOpencodeError,
  attemptOpencodeSelfHealing,
  validateOpencodeInstallation,
} from '@loopwork-ai/loopwork';

// Check if error is OpenCode-related
const error = "Cannot find package 'zod'";
if (isOpencodeError(error)) {
  console.log('OpenCode issue detected!');
}

// Get detailed issue information
const issues = detectOpencodeIssues(error);
console.log(issues);
// [{ type: 'missing_dependency', package: 'zod', autoFixable: true }]

// Attempt automatic repair
const healed = await attemptOpencodeSelfHealing(error);
if (healed) {
  console.log('OpenCode repaired successfully!');
}

// Validate installation health
const status = await validateOpencodeInstallation();
console.log(status.valid);  // true/false
console.log(status.issues); // Array of issues
```

## Troubleshooting

### Healing Still Fails

If automatic healing doesn't work:

1. **Check bun installation:**
   ```bash
   which bun
   bun --version
   ```

2. **Check opencode paths:**
   ```bash
   ls -la ~/.opencode/
   ls -la ~/.cache/opencode/
   ```

3. **Manual reinstall:**
   ```bash
   # Backup and reinstall
   mv ~/.opencode ~/.opencode.backup
   mv ~/.cache/opencode ~/.cache/opencode.backup
   
   # Reinstall opencode
   curl -fsSL https://opencode.sh/install | bash
   ```

### Disabling Self-Healing

To disable OpenCode self-healing (not recommended):

```typescript
// This disables ALL self-healing
export default defineConfig({
  selfHealingCooldown: 0, // Prevents healing from running
})
```

## Related Documentation

- [Simplified Config](./SIMPLIFIED_CONFIG.md) - Easier configuration options
- [Parallel Execution](./docs/parallel-execution.md) - How parallel mode works
- [Circuit Breaker](./docs/circuit-breaker.md) - Failure handling patterns
