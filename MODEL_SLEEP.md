# Model Sleep Mode

Instead of permanently disabling models after 3 failures, Loopwork now puts models to **sleep** for 10 minutes, after which they automatically wake up and become available again.

## How It Works

1. **Sleep Trigger**: After 3 consecutive failures, a model goes to sleep
2. **Sleep Duration**: 10 minutes (configurable)
3. **Auto Wake-up**: Models automatically become available again after the sleep period
4. **Clear Messaging**: Logs show sleep status and wake-up time

## Example Log Output

### When a Model Goes to Sleep
```
03:52:49 ⚠️ WARN: [CircuitBreaker] Model antigravity-claude-sonnet-4-5 is sleeping after 3 failures (sleeping for 10m 0s, wakes up at 04:02:49)
```

### When a Model Wakes Up
```
04:02:49 ℹ️ INFO: [CircuitBreaker] Model antigravity-claude-sonnet-4-5 woke up from sleep and is available again
```

### Checking Model Status
```
# Dashboard or status command shows:
Sleeping Models: antigravity-claude-sonnet-4-5 (wakes up in 5m 30s)
```

## Configuration

You can customize the sleep duration in your config:

```typescript
// loopwork.config.ts
export default defineConfig({
  cliConfig: {
    // Models sleep for 10 minutes after 3 failures (default)
    circuitBreaker: {
      failureThreshold: 3,      // Failures before sleeping
      resetTimeoutMs: 600000,   // Sleep duration: 10 minutes
    }
  }
})
```

### Sleep Duration Options

| Duration | Value |
|----------|-------|
| 5 minutes | `300000` |
| 10 minutes | `600000` (default) |
| 15 minutes | `900000` |
| 30 minutes | `1800000` |
| 1 hour | `3600000` |

## Benefits

1. **Self-Healing**: Temporary issues (rate limits, brief outages) resolve themselves
2. **Better UX**: Clear messaging about when models will be available again
3. **No Manual Intervention**: Models automatically recover after sleep
4. **Graceful Degradation**: Failed models don't block the entire workflow

## Comparison: Old vs New

### Old Behavior (Disabled)
```
03:52:49 ❌ ERROR: [CircuitBreaker] Model antigravity-claude-sonnet-4-5 disabled after 3 failures
# Model stays disabled until loopwork restart
```

### New Behavior (Sleeping)
```
03:52:49 ⚠️ WARN: [CircuitBreaker] Model antigravity-claude-sonnet-4-5 is sleeping after 3 failures (sleeping for 10m 0s, wakes up at 04:02:49)
04:02:49 ℹ️ INFO: [CircuitBreaker] Model antigravity-claude-sonnet-4-5 woke up from sleep and is available again
# Model automatically available again
```

## Implementation Details

The sleep mechanism uses a circuit breaker pattern with:
- **State**: `closed` → `open` (sleeping) → `half-open` (testing) → `closed`
- **Auto-reset**: Timer-based wake-up after `resetTimeoutMs`
- **Success tracking**: Successful calls decrement failure count
- **Wake-up callbacks**: System logs when models become available

## API for Programmatic Access

```typescript
import { ModelSelector } from '@loopwork-ai/executor';

const selector = new ModelSelector(models, fallbackModels, 'round-robin', {
  enableCircuitBreaker: true,
  failureThreshold: 3,
  resetTimeoutMs: 600000, // 10 minutes
});

// Get sleeping models
const sleeping = selector.getSleepingModels();
console.log('Sleeping:', sleeping);

// Get wake-up time for a model
const wakeUpTime = selector.getModelWakeUpTime('model-name');
console.log('Wakes up at:', wakeUpTime);

// Get detailed sleep status
const status = selector.getModelSleepStatus('model-name');
console.log(status);
// { isSleeping: true, wakeUpTime: Date, timeRemaining: '5m 30s' }

// Register wake-up callback
selector.onModelWakeUp((modelName) => {
  console.log(`${modelName} is available again!`);
});
```

## Monitoring

To see which models are currently sleeping:

```bash
# Check dashboard
loopwork dashboard

# Check logs
grep "sleeping\|woke up" .loopwork/runs/default/*/loopwork.log
```
