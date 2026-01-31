# EXTRACTI-021: Implement Composition Root

## Goal
Re-implement `loopwork/src/index.ts` to wire up all the new packages. Construct the dependency graph (Logger -> State -> Executor -> Loop).
## Files
- `packages/loopwork/src/index.ts`
- `packages/loopwork/src/composition.ts`
## Dependencies
Depends on: EXTRACTI-007, EXTRACTI-012, EXTRACTI-015, EXTRACTI-018, EXTRACTI-020
**Estimated Time:** 90 min
**Complexity:** ★★★★★ (5/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Missing dependency injection causing runtime crash
- Version mismatch between local packages

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Full E2E run of a basic task.
