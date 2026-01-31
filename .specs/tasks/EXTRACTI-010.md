# EXTRACTI-010: Extract File Persistence

## Goal
Move filesystem-based state persistence logic to `FilePersistenceLayer` in the new package. Must implement `IPersistenceLayer`.
## Files
- `packages/state/src/persistence/file.ts`
- `packages/loopwork/src/core/state.ts`
## Dependencies
Depends on: EXTRACTI-009
**Estimated Time:** 45 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- File locking race conditions
- Permission errors

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Unit test reading/writing JSON files via the new class.
