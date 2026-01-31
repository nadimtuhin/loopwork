# ARCHWAVE-096: Implement Budget Logic

## Goal
Move daily budget calculation and per-task cost aggregation logic from `cost-tracking` plugin to this package. Implement `SimpleBudgetManager` that persists usage state.
## Files
- `packages/budget-manager/src/tracker.ts`
- `packages/budget-manager/src/budget.ts`
- `packages/budget-manager/test/budget.test.ts`
## Dependencies
Depends on: ARCHWAVE-095
**Estimated Time:** 45-60 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Budget exceeded
- Currency conversion (future proofing)

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Unit test: verify budget caps stop execution
