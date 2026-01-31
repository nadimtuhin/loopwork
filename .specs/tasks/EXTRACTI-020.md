# EXTRACTI-020: Extract Plugin Registry

## Goal
Create `@loopwork-ai/plugin-registry` and move registry logic there. Remove all hardcoded imports of specific plugins (like `withGitAutoCommit`).
## Files
- `packages/plugin-registry/src/registry.ts`
- `packages/loopwork/src/core/plugin-registry.ts`
## Dependencies
Depends on: EXTRACTI-019
**Estimated Time:** 60 min
**Complexity:** ★★★★☆ (4/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Plugin ordering/priority logic

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Test registering and retrieving plugins without importing them.
