# ARCHWAVE-063: Integrate Pipeline into LoopworkRunner

## Goal
Replace the existing plugin loop in `LoopworkRunner` with the new `hook-engine`.

HOW: Convert existing plugins to middleware format (adapter pattern if needed). Use `Pipeline` for `onTaskStart`, `onLoopStart`, etc.

WHY: Enables advanced plugin capabilities like short-circuiting.
## Files
- `packages/loopwork/src/core/runner.ts`
- `packages/loopwork/src/core/plugin-adapter.ts`
## Dependencies
Depends on: ARCHWAVE-062
**Estimated Time:** 60 min
**Complexity:** ★★★★☆ (4/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Legacy plugin compatibility

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Run e2e tests to ensure plugins still fire
