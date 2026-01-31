# ARCHWAVE-105: Implement Docker & Local Providers

## Goal
Implement `DockerIsolationProvider` (move existing logic) and `LocalIsolationProvider` (Noop/Direct execution) in the new package.
## Files
- `packages/isolation/src/docker-provider.ts`
- `packages/isolation/src/local-provider.ts`
- `packages/isolation/test/providers.test.ts`
## Dependencies
Depends on: ARCHWAVE-104
**Estimated Time:** 60 min
**Complexity:** ★★★★☆ (4/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Docker daemon not running
- Permission issues

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Unit test providers with mock child_process/dockerode
