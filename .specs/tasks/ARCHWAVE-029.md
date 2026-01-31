# ARCHWAVE-029: Scaffold cli-commands Package

## Goal
Initialize the new package for CLI command controllers.

WHAT: Create `@loopwork-ai/cli-commands` with necessary boilerplate.
WHY: To provide a home for the extracted command logic.
HOW: Create `packages/cli-commands/package.json` (deps: contracts), `tsconfig.json`, and `src/index.ts`.
ACCEPTANCE: Package builds and can be imported.
## Files
- `packages/cli-commands/package.json`
- `packages/cli-commands/tsconfig.json`
- `packages/cli-commands/src/index.ts`
## Dependencies
Depends on: ARCHWAVE-028
**Estimated Time:** 15 min
**Complexity:** ★☆☆☆☆ (1/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Ensure workspace dependency versions match root

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Run `bun run build` in the new package directory.
