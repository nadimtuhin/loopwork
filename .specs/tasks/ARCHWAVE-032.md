# ARCHWAVE-032: Integrate Command Registry

## Goal
Refactor the main application entry point to use the new command classes.

WHAT: Replace inline commander actions with `commandRegistry.register(new RescheduleCommand())` calls.
WHY: Complete the decoupling; `loopwork` package becomes a composition root.
HOW: Modify `packages/loopwork/src/index.ts` (or `cli.ts`). Import from `@loopwork-ai/cli-commands`.
ACCEPTANCE: CLI commands `loopwork reschedule`, `init`, and `config` work E2E.
## Files
- `packages/loopwork/src/cli.ts`
- `packages/loopwork/package.json`
## Dependencies
Depends on: ARCHWAVE-030, ARCHWAVE-031
**Estimated Time:** 30-45 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Ensure dependency injection works for command constructors

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Run manual CLI smoke tests or existing E2E tests.
