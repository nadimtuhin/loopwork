# ARCHWAVE-019: Integrate Messaging into LoopworkRunner

## Goal
Refactor `LoopworkRunner` to instantiate the message bus and inject it into the context provided to plugins. Replace any direct `EventEmitter` usage with the new bus.
## Files
- `packages/loopwork/src/core/runner.ts`
- `packages/loopwork/src/core/context.ts`
## Dependencies
Depends on: ARCHWAVE-018
**Estimated Time:** 30-45 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Plugins attempting to use bus before initialization
- Backward compatibility for plugins expecting old context shape

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Run core loopwork tests; verify plugins receive the bus in `onLoopStart`.
