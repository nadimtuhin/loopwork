# EXTRACTI-011: Extract Loopwork State Logic

## Goal
Move `LoopworkState` business logic (runs, iterations, resume) to the new package. Refactor to usage of persistence layer interface.
## Files
- `packages/state/src/state-manager.ts`
- `packages/loopwork/src/core/state.ts`
## Dependencies
Depends on: EXTRACTI-010
**Estimated Time:** 45 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Corrupted state file recovery

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Test state transitions and locking logic isolated from main loop.
