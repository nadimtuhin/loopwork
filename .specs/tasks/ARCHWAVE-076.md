# ARCHWAVE-076: Inject Lifecycle Manager into Runner

## Goal
Refactor LoopworkRunner to use IHeartbeatProvider. Remove direct file system calls for lock files from the runner.
## Files
- `packages/loopwork/src/core/runner.ts`
- `packages/loopwork/src/index.ts`
## Dependencies
Depends on: ARCHWAVE-075
**Estimated Time:** 45 min
**Complexity:** ★★★★☆ (4/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Runner startup when stale lock exists

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Run e2e loop test. Verify lock files are created/cleaned up.
