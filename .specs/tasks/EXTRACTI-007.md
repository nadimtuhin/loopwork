# EXTRACTI-007: Update Consumers to use Interface

## Goal
Refactor `CliExecutor` and `Monitor` to use the injected `IProcessManager` instance instead of concrete classes or global singletons.
## Files
- `packages/loopwork/src/core/cli.ts`
- `packages/loopwork/src/core/monitor.ts`
## Dependencies
Depends on: EXTRACTI-006
**Estimated Time:** 30 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Loss of functionality if consumers relied on specific implementation details not in interface

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Verify CLI commands are correctly spawned via the injected manager.
