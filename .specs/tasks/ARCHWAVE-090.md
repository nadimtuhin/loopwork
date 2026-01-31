# ARCHWAVE-090: Define Resilience Contracts

## Goal
Define `IRetryStrategy`, `IBackoffPolicy`, and `ResilienceEngine` interfaces. These cover retry counts, delay calculations, and the execution wrapper for fail-safe operations.
## Files
- `packages/contracts/src/resilience.ts`
- `packages/contracts/src/index.ts`
**Estimated Time:** 15-30 min
**Complexity:** ★★☆☆☆ (2/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Verify type exports
