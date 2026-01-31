# EXTRACTI-004: Migrate Spawners

## Goal
Move `PtySpawner` and `StandardSpawner` to the new package. Ensure they implement `ISpawner` from contracts. Clean up any lingering dependencies on legacy Loopwork core types.
## Files
- `packages/process-manager/src/spawner/pty.ts`
- `packages/process-manager/src/spawner/standard.ts`
- `packages/process-manager/src/spawner/index.ts`
## Dependencies
Depends on: EXTRACTI-003
**Estimated Time:** 30-45 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Platform specific spawn options (Windows vs Unix)
- PTY resizing handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Mock `node-pty` and `child_process` to verify spawn logic independent of core.
