# ARCHWAVE-097: Integrate Budget Manager into Plugin

## Goal
Refactor `packages/cost-tracking` to act as a thin wrapper around `@loopwork-ai/budget-manager`. The plugin should configure the manager and hook into `onTaskComplete` to record usage.
## Files
- `packages/cost-tracking/src/index.ts`
- `packages/cost-tracking/test/index.test.ts`
## Dependencies
Depends on: ARCHWAVE-096
**Estimated Time:** 30-45 min
**Complexity:** ★★☆☆☆ (2/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Integration test: Run loop with low budget and verify early termination
