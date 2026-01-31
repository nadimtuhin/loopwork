# ARCHWAVE-092: Implement Resilience Strategies

## Goal
Implement `ExponentialBackoff` and `StandardRetryStrategy`. Create a `ResilienceRunner` that takes an async function and applies the strategy. Move rate-limit handling logic (wait 30s) into a specific strategy.
## Files
- `packages/resilience/src/backoff.ts`
- `packages/resilience/src/retry.ts`
- `packages/resilience/test/retry.test.ts`
## Dependencies
Depends on: ARCHWAVE-091
**Estimated Time:** 45-60 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Max retries exceeded
- Non-retryable errors

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Unit test with mock failures to verify retry count and backoff timing
