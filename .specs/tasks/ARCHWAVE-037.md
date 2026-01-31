# ARCHWAVE-037: Integrate UI Library

## Goal
Update consumers to use the new UI package.

WHAT: Refactor `dashboard` and `monitor` commands in `loopwork` to import from `@loopwork-ai/ui-components`.
WHY: Validate the extraction.
HOW: Update imports in `packages/loopwork`.
ACCEPTANCE: Dashboard and CLI output look identical to before.
## Files
- `packages/loopwork/src/commands/dashboard.tsx`
- `packages/loopwork/src/commands/monitor.tsx`
- `packages/loopwork/package.json`
## Dependencies
Depends on: ARCHWAVE-036
**Estimated Time:** 30 min
**Complexity:** ★★☆☆☆ (2/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Missing peer dependencies in consumer

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Visual verification of dashboard.
