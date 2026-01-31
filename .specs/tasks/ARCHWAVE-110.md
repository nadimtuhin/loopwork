# ARCHWAVE-110: Integrate Notifications into Core

## Goal
Update `Loopwork` core to use `INotificationProvider` for sending events (task start/complete/fail) instead of ad-hoc hooks if applicable, or ensure hooks utilize this provider.
## Files
- `packages/loopwork/src/core/loop.ts`
## Dependencies
Depends on: ARCHWAVE-109
**Estimated Time:** 30 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Integration test: Trigger loop event, verify notification mock received it
