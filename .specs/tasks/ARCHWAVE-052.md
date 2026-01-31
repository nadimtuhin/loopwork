# ARCHWAVE-052: Define Test Harness Contracts

## Goal
Define contracts for the new standardized testing system. Create `IMockProvider`, `TestEnvironment`, and `IVirtualFileSystem` interfaces.

HOW: Add to `packages/contracts`. `IMockProvider` should define methods for mocking CLI outputs. `TestEnvironment` should define setup/teardown.

WHY: Essential for fixing the fragile test suite.
## Files
- `packages/contracts/src/testing.ts`
**Estimated Time:** 30 min
**Complexity:** ★★☆☆☆ (2/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Async setup/teardown handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Type checks
