# ARCHWAVE-046: Refactor Core Utils

## Goal
Replace God-object utils with granular imports.

WHAT: Update `packages/loopwork/src/core/utils.ts` to re-export from new packages (deprecated) or replace usages.
WHY: Enforce usage of new modular packages.
HOW: Update imports across the codebase to point to `@loopwork-ai/utils-*`.
ACCEPTANCE: No direct dependency on monolithic utils file.
## Files
- `packages/loopwork/src/core/utils.ts`
- `packages/loopwork/package.json`
## Dependencies
Depends on: ARCHWAVE-044, ARCHWAVE-045
**Estimated Time:** 45 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Circular dependencies during refactor

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Full build verification.
