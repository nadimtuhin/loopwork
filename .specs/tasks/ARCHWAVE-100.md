# ARCHWAVE-100: Implement NamespaceManager

## Goal
Implement `NamespaceManager` in the new orchestrator package. Extract logic currently residing in core (likely in state or cli modules) related to finding, listing, and validating namespaces.
## Files
- `packages/orchestrator/src/namespace-manager.ts`
- `packages/orchestrator/test/namespace-manager.test.ts`
## Dependencies
Depends on: ARCHWAVE-099
**Estimated Time:** 45 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Handle missing loopwork directories
- Handle corrupted state files

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Unit test finding namespaces on mock filesystem
