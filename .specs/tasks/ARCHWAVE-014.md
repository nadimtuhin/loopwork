# ARCHWAVE-014: Integrate & Verify Wave 2

## Goal
Inject all new packages back into `loopwork` core and plugins. Update imports and dependency injection.

Deliverables:
- Update `packages/loopwork/package.json` to depend on new packages.
- Refactor `CliExecutor`, `SafetyPlugin`, `TaskRecoveryPlugin` to use new interfaces/classes.
- Remove old code from `packages/loopwork/src/core`.

Acceptance Criteria:
- Build succeeds for all packages.
- `bun test` passes in root.
- No circular dependency warnings.
## Files
- `packages/loopwork/package.json`
- `packages/loopwork/src/core/cli.ts`
- `packages/loopwork/src/plugins/safety.ts`
## Dependencies
Depends on: ARCH-VEC-005, ARCH-ANAL-004, ARCH-SAFE-005, ARCH-ADAPT-004
**Estimated Time:** 60 min
**Complexity:** ★★★★☆ (4/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Missing re-exports
- Broken plugin configs

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Full integration test run
