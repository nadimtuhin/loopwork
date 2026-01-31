# ARCHWAVE-054: Implement MemoryBackend and MockCliExecutor

## Goal
Create in-memory implementations of the TaskBackend and CliExecutor for fast, side-effect-free testing.

HOW: `MemoryTaskBackend` stores tasks in a Map/Array. `MockCliExecutor` replays pre-configured responses based on input patterns (regex matching).

WHY: Allows testing core logic without disk I/O or actual AI calls.
## Files
- `packages/test-harness/src/mocks/backend.ts`
- `packages/test-harness/src/mocks/cli.ts`
## Dependencies
Depends on: ARCHWAVE-053
**Estimated Time:** 45-60 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Simulating CLI timeouts
- Concurrent task modification

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Unit test the mocks themselves to ensure they behave like real implementations
