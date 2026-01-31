# ARCHWAVE-044: Extract Utils-FS

## Goal
Create specialized filesystem utilities package.

WHAT: Create `@loopwork-ai/utils-fs` and move locking logic.
WHY: File locking is a distinct, reusable mechanism.
HOW: Move `FileLock` and `withLock` from `utils.ts`.
ACCEPTANCE: Tests pass for locking mechanism.
## Files
- `packages/utils-fs/package.json`
- `packages/utils-fs/src/lock.ts`
- `packages/utils-fs/src/index.ts`
**Estimated Time:** 30 min
**Complexity:** ★★☆☆☆ (2/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Process crash leaving locks
- Read-only filesystems

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Test lock contention and stale lock cleanup.
