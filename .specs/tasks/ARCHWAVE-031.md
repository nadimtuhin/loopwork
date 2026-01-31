# ARCHWAVE-031: Extract Init and Config Commands

## Goal
Move initialization and configuration inspection logic.

WHAT: Implement `InitCommand` and `ConfigCommand` classes.
WHY: Further cleanup of the CLI entry point.
HOW: Port logic to `packages/cli-commands/src/init.ts` and `src/config.ts`. Ensure they use the new contract interfaces.
ACCEPTANCE: Commands behave identically to current implementation in isolation tests.
## Files
- `packages/cli-commands/src/init.ts`
- `packages/cli-commands/src/config.ts`
- `packages/cli-commands/test/commands.test.ts`
## Dependencies
Depends on: ARCHWAVE-029
**Estimated Time:** 30-45 min
**Complexity:** ★★☆☆☆ (2/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Init in existing project
- Config with circular references

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Test InitCommand creates files; Test ConfigCommand outputs correct JSON.
