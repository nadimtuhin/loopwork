# ARCHWAVE-106: Inject Isolation into CliExecutor

## Goal
Refactor `CliExecutor` in `packages/loopwork` to accept `IIsolationProvider` via constructor injection. Default to LocalProvider if not configured.
## Files
- `packages/loopwork/src/core/cli.ts`
- `packages/loopwork/src/index.ts`
## Dependencies
Depends on: ARCHWAVE-105
**Estimated Time:** 45 min
**Complexity:** ★★★★☆ (4/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Environment variable propagation to sandbox

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Run existing CLI tests ensuring commands still execute
