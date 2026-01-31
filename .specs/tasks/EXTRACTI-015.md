# EXTRACTI-015: Migrate CliExecutor

## Goal
Move `CliExecutor` to the new package. Decouple from global `plugins`. Inject `IPluginRegistry` (or similar contract) if needed for hooks.
## Files
- `packages/executor/src/cli-executor.ts`
- `packages/loopwork/src/core/cli.ts`
## Dependencies
Depends on: EXTRACTI-014
**Estimated Time:** 60 min
**Complexity:** ★★★★☆ (4/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Plugins failing during execution hooks

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Test execution flow with mocked plugins.
