# ARCHWAVE-039: Migrate Task Recovery Logic

## Goal
Move the failure analysis and recovery implementation.

WHAT: Port `task-recovery.ts` logic to the new plugin.
WHY: This logic is heavy and model-dependent.
HOW: Move code. Ensure it implements `LoopworkPlugin` contract.
ACCEPTANCE: Tests for recovery analysis pass in new package.
## Files
- `packages/plugin-task-recovery/src/index.ts`
- `packages/plugin-task-recovery/test/recovery.test.ts`
## Dependencies
Depends on: ARCHWAVE-038
**Estimated Time:** 45 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Looping recovery attempts
- Context limit exceeded

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Mock LLM responses and verify recovery strategies.
