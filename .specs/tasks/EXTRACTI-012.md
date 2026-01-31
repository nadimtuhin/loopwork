# EXTRACTI-012: Inject StateManager into Core

## Goal
Update `Loopwork` core to receive `IStateManager` via constructor. Remove hardcoded state file paths from core.
## Files
- `packages/loopwork/src/core/loop.ts`
## Dependencies
Depends on: EXTRACTI-011
**Estimated Time:** 30 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Verify loop can resume state using injected manager.
