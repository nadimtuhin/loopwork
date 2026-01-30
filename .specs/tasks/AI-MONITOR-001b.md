# AI-MONITOR-001b: Concurrency Manager

## Goal
Implement per-provider/model concurrency limits with key-based queuing to prevent API rate limits.

## Requirements
- [x] Create `ConcurrencyManager` class that manages request slots
- [x] Support hierarchical limit resolution: model-specific > provider-specific > default
- [x] Implement `acquire(key, timeout?)` method that waits for available slots
- [x] Implement `release(key)` method that frees slots and processes queue
- [x] Support FIFO queuing when no slots available
- [x] Provide timeout support for acquire operations
- [x] Track statistics: active slots, queue lengths
- [x] Implement `reset()` method for cleanup
- [x] Export factory function and utility helpers

## Implementation Details

### Configuration
```typescript
interface ConcurrencyConfig {
  default: number              // Default: 3
  providers: {
    [key: string]: number      // e.g., claude: 2, gemini: 3
  }
  models: {
    [key: string]: number      // e.g., 'claude-opus': 1
  }
}
```

### Key Features
1. **Hierarchical Limit Resolution**: Checks model-specific → provider-specific → default
2. **FIFO Queueing**: Requests wait in order when slots unavailable
3. **Independent Queues**: Each key (provider:model) has its own queue
4. **Timeout Support**: Optional timeout for waiting requests
5. **Statistics Tracking**: Monitor active slots and queue lengths

## Success Criteria
- [x] All unit tests pass (30 tests)
- [x] Covers configuration, limit resolution, slot management, queueing, statistics, and reset
- [x] Real-world scenarios tested: burst requests, rate limit prevention, mixed providers
- [x] No type errors
- [x] Code follows project conventions

## Test Coverage
- Configuration: 2 tests
- Limit Resolution: 5 tests
- Slot Management: 5 tests
- Queueing: 4 tests
- Statistics: 4 tests
- Reset: 3 tests
- Utility Functions: 4 tests
- Real-world Scenarios: 3 tests

**Total: 30 passing tests**

## Files
- `packages/loopwork/src/ai-monitor/concurrency.ts` - Implementation (210 lines)
- `packages/loopwork/src/ai-monitor/types.ts` - Type definitions
- `packages/loopwork/test/ai-monitor/concurrency.test.ts` - Comprehensive tests (438 lines)

## Integration
The ConcurrencyManager will be used by the AI Monitor to:
- Prevent API rate limits by limiting concurrent requests per provider
- Queue healing operations when provider is busy
- Track resource usage across multiple providers/models
