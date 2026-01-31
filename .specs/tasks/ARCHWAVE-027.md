# ARCHWAVE-027: Final Integration & Verification

## Goal
Wire up the new Config Engine, Telemetry, and Backend packages into the main `LoopworkRunner`. Update `shared/config-utils.ts` to use provider lookup. Run full E2E suite.
## Files
- `packages/loopwork/src/index.ts`
- `packages/loopwork/test/e2e.test.ts`
## Dependencies
Depends on: ARCHWAVE-019, ARCHWAVE-022, ARCHWAVE-024, ARCHWAVE-026
**Estimated Time:** 60 min
**Complexity:** ★★★★☆ (4/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Missing dependency injection in the runner
- Config loading failures with new paths

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Full E2E test run (`bun run test`). Verify no regressions in CLI behavior.
