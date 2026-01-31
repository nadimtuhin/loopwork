# ARCHWAVE-026: Create Backend Packages

## Goal
Scaffold `@loopwork-ai/backend-json` and `@loopwork-ai/backend-github`. Move the existing adapter logic from `packages/loopwork/src/backends/` to these new packages.
## Files
- `packages/backend-json/src/index.ts`
- `packages/backend-github/src/index.ts`
- `packages/loopwork/src/backends/json.ts`
- `packages/loopwork/src/backends/github.ts`
## Dependencies
Depends on: ARCHWAVE-025
**Estimated Time:** 60-90 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- File locking logic in JSON backend must work when moved
- GitHub API client authentication propagation

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Run existing backend integration tests pointed at the new packages.
