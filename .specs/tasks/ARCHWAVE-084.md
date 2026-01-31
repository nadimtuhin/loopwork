# ARCHWAVE-084: Implement CLI Detection Logic

## Goal
Implement `NodeBasedCliDetector` implementing `ICliDetector`. Logic should scan `PATH` environment variable and check standard locations (e.g., `~/.npm-global/bin`) for `claude` and `opencode` binaries. Must return `IBinaryInfo` with version and path.
## Files
- `packages/cli-detector/src/detector.ts`
- `packages/cli-detector/test/detector.test.ts`
## Dependencies
Depends on: ARCHWAVE-083
**Estimated Time:** 45-60 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Binary not found
- Permission denied
- Windows paths

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Unit test with mocked `process.env.PATH` and file system existence checks
