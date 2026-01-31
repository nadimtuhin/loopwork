# ARCHWAVE-112: Implement PluginScaffolder

## Goal
Extract plugin generation logic (copying templates, creating package.json) from `InitCommand` to `PluginScaffolder` in dev-tools.
## Files
- `packages/dev-tools/src/scaffolder.ts`
- `packages/dev-tools/templates/plugin/**`
- `packages/dev-tools/test/scaffolder.test.ts`
## Dependencies
Depends on: ARCHWAVE-111
**Estimated Time:** 45 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Template file missing
- Target directory exists

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Test scaffolding a new plugin in a temp directory
