# ARCHWAVE-036: Migrate Complex UI Components

## Goal
Move stateful or logic-heavy components.

WHAT: Migrate `InkLog`, `InkStream`, and `CompletionSummary`.
WHY: These are core to the runner's display logic.
HOW: Move files. Ensure they depend on contracts, not core implementation details.
ACCEPTANCE: Components compile and tests pass.
## Files
- `packages/ui-components/src/InkLog.tsx`
- `packages/ui-components/src/CompletionSummary.tsx`
## Dependencies
Depends on: ARCHWAVE-035
**Estimated Time:** 45 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Log buffer overflows
- Ansi code handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Verify event handling in InkStream.
