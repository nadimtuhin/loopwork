# ARCHWAVE-080: Integrate Error Service into Utils

## Goal
Update handleError utility and CLI error reporting to use the injected IErrorRegistry. Replace hardcoded strings.
## Files
- `packages/loopwork/src/core/utils.ts`
- `packages/loopwork/src/index.ts`
## Dependencies
Depends on: ARCHWAVE-079
**Estimated Time:** 30 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Fallback for errors before registry is initialized

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Trigger specific errors and verify output format/links.
