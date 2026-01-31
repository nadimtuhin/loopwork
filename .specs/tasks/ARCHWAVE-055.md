# ARCHWAVE-055: Implement VirtualFileSystem Helper

## Goal
Create a wrapper around `memfs` or similar to provide a virtual file system for tests.

HOW: Implement `IVirtualFileSystem`. Provide helper methods like `createMockProject(structure)`.

WHY: Tests currently pollute the disk or rely on complex fs mocking.
## Files
- `packages/test-harness/src/mocks/fs.ts`
## Dependencies
Depends on: ARCHWAVE-054
**Estimated Time:** 30-45 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Path normalization across OS

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Verify file read/writes persist in memory only
