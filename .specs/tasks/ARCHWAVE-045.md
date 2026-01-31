# ARCHWAVE-045: Extract Utils-Common

## Goal
Create general utility package.

WHAT: Create `@loopwork-ai/utils-common`.
WHY: Shared async patterns and helpers.
HOW: Move remaining generic helpers (sleep, retry, etc.) from `utils.ts`.
ACCEPTANCE: Utils exported correctly.
## Files
- `packages/utils-common/package.json`
- `packages/utils-common/src/async.ts`
- `packages/utils-common/src/index.ts`
**Estimated Time:** 30 min
**Complexity:** ★☆☆☆☆ (1/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- None

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Unit tests for helper functions.
