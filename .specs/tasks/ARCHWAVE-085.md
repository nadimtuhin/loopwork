# ARCHWAVE-085: Integrate CLI Detector into Core

## Goal
Refactor `CliExecutor` in `packages/loopwork` to accept an `ICliDetector` via constructor injection. Remove hardcoded detection logic and delegate to the injected instance. Update `compose` or factory to provide the default detector.
## Files
- `packages/loopwork/src/core/cli.ts`
- `packages/loopwork/test/core/cli.test.ts`
## Dependencies
Depends on: ARCHWAVE-084
**Estimated Time:** 30-45 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Detector returns no binaries

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Integration test verifying `CliExecutor` correctly uses the mock detector
