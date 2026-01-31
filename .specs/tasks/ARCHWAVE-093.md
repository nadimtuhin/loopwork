# ARCHWAVE-093: Integrate Resilience Engine into Core

## Goal
Inject `ResilienceEngine` into `CliExecutor`. Replace ad-hoc `try/catch` and `setTimeout` loops in `executeTask` with the resilience runner.
## Files
- `packages/loopwork/src/core/cli.ts`
- `packages/loopwork/src/core/runner.ts`
## Dependencies
Depends on: ARCHWAVE-092
**Estimated Time:** 45-60 min
**Complexity:** ★★★★☆ (4/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Integration test: Simulate transient CLI failures and verify auto-retry behavior
