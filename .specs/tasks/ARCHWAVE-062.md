# ARCHWAVE-062: Implement Middleware Runner

## Goal
Implement the onion-model middleware runner.

HOW: Create a `Pipeline` class that allows `use()` and `execute()`. `execute` should compose functions and handle the `next` chain.

WHY: More robust than simple array iteration for hooks.
## Files
- `packages/hook-engine/src/pipeline.ts`
- `packages/hook-engine/src/compose.ts`
## Dependencies
Depends on: ARCHWAVE-061
**Estimated Time:** 45-60 min
**Complexity:** ★★★★☆ (4/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Error in middleware stops chain
- Middleware not calling next

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Unit tests ensuring execution order (A start -> B start -> B end -> A end)
