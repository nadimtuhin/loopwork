# ARCHWAVE-075: Implement File-Based Heartbeat

## Goal
Extract heartbeat file writing/reading logic into FileHeartbeatProvider in the new package. Implement stale lock detection logic here.
## Files
- `packages/lifecycle-manager/src/heartbeat.ts`
- `packages/lifecycle-manager/test/heartbeat.test.ts`
## Dependencies
Depends on: ARCHWAVE-074
**Estimated Time:** 45 min
**Complexity:** ★★★★☆ (4/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Process crash scenarios
- Permission errors on lock files

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Test with actual file I/O mocks. Verify PID checking logic.
