# ARCHWAVE-013: Extract CLI and Git Adapters

## Goal
Move `CliRunnerAdapter` and `GitRunnerAdapter` to `@loopwork-ai/adapters`.

Deliverables:
- `packages/adapters/src/cli-adapter.ts`
- `packages/adapters/src/git-adapter.ts`

Acceptance Criteria:
- Implement `IRunnerAdapter` and `IGitAdapter` respectively.
- Move execution logic from core.
## Files
- `packages/adapters/src/cli-adapter.ts`
- `packages/adapters/src/git-adapter.ts`
## Dependencies
Depends on: ARCHWAVE-012
**Estimated Time:** 40 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Windows vs Unix paths
- Shell escaping

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Mock exec calls to verify command construction
