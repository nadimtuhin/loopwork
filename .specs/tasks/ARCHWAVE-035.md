# ARCHWAVE-035: Migrate Basic UI Components

## Goal
Move stateless UI components to the new library.

WHAT: Migrate `Banner`, `ProgressBar`, and `Table`.
WHY: Reuse across dashboard and CLI.
HOW: Move files from `loopwork/src/components` to `ui-components/src`.
ACCEPTANCE: Components render correctly in isolation.
## Files
- `packages/ui-components/src/Banner.tsx`
- `packages/ui-components/src/ProgressBar.tsx`
- `packages/ui-components/src/Table.tsx`
## Dependencies
Depends on: ARCHWAVE-034
**Estimated Time:** 30 min
**Complexity:** ★★☆☆☆ (2/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Terminal width responsiveness

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Unit test renders (using ink-testing-library if available).
