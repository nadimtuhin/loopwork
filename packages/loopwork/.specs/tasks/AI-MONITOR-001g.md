# AI-MONITOR-001g: Wisdom System (Learn from Healing)

## Goal
Implement a wisdom system that stores learned error patterns in `.loopwork/ai-monitor/`, tracks what fixes work, accumulates wisdom across sessions, and expires old patterns after 30 days.

## Requirements

### Core Functionality
- [x] Store learned error patterns in `.loopwork/ai-monitor/wisdom.json`
- [x] Track success and failure counts for each pattern
- [x] Calculate success rate: `successCount / (successCount + failureCount)`
- [x] Expire patterns after 30 days (configurable)
- [x] Extend expiry on successful use
- [x] Auto-remove expired patterns on load

### Data Flow (Integration Check)
Successful healing → WisdomStore.record() → persist to disk → load on next session

Seams:
- Recording (recordSuccess/recordFailure)
- Persistence (saveWisdom/loadWisdom)
- Retrieval (findPattern)
- Expiration (clearExpired)

### API Methods
- [x] `recordSuccess(pattern, improvement?)` - Record successful healing
- [x] `recordFailure(pattern, reason?)` - Record failed healing
- [x] `findPattern(pattern)` - Find learned pattern (returns null if expired/untrusted)
- [x] `getPatterns(filter?)` - Get all patterns (sorted by success rate)
- [x] `getStats()` - Get wisdom statistics
- [x] `exportSessionHistory()` - Export session history
- [x] `clearExpired()` - Remove expired patterns
- [x] `reset()` - Reset wisdom store

## Success Criteria
- [x] All 28 wisdom system tests pass
- [x] Integration test: heal error → wisdom saved → restart → wisdom loaded → same error uses learned fix
- [x] Pattern expiration works correctly
- [x] Trust threshold enforced
- [x] Statistics accurately track heals and failures
- [x] Session history export works

## Implementation Status

### Completed Files
- [x] `src/ai-monitor/wisdom.ts` - Core WisdomSystem class (403 lines)
- [x] `src/ai-monitor/index.ts` - Integration with AIMonitor (lines 566, 580)
- [x] `test/ai-monitor/wisdom.test.ts` - Comprehensive tests (28 tests, all passing)

### Integration Points
The wisdom system is integrated into the AIMonitor at two key points:

1. **Success Recording** (index.ts:566):
```typescript
if (errorPattern) {
  this.wisdomSystem.recordSuccess(errorPattern, `${action.type} action succeeded`)
}
```

2. **Failure Recording** (index.ts:580):
```typescript
if (errorPattern) {
  this.wisdomSystem.recordFailure(errorPattern, result.error || 'Unknown error')
}
```

## Test Results
All 28 tests pass successfully:
- 4 Learning and Recording tests
- 4 Pattern Retrieval tests
- 3 Persistence (Integration) tests ✅ **KEY INTEGRATION TESTS**
- 4 Pattern Expiration tests
- 4 Statistics and Reporting tests
- 4 Reset and Maintenance tests
- 2 Pattern Signature and Hashing tests
- 3 Edge Cases tests
