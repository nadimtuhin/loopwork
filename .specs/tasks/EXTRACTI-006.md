# EXTRACTI-006: Inject ProcessManager into Core

## Goal
Refactor `Loopwork` core class to accept `IProcessManager` via constructor injection. Remove internal instantiation of spawners.
## Files
- `packages/loopwork/src/core/loop.ts`
- `packages/loopwork/src/index.ts`
## Dependencies
Depends on: EXTRACTI-005
**Estimated Time:** 30 min
**Complexity:** ★★★★☆ (4/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Breaking changes to Loopwork constructor signature

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Update Core unit tests to pass mocked IProcessManager.
