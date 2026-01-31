# ARCHWAVE-108: Implement CompositeNotificationProvider

## Goal
Create a provider that aggregates multiple notification channels and broadcasts messages to all of them.
## Files
- `packages/notifications/src/composite-provider.ts`
- `packages/notifications/test/composite.test.ts`
## Dependencies
Depends on: ARCHWAVE-107
**Estimated Time:** 30 min
**Complexity:** ★★☆☆☆ (2/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- One provider failing should not stop others

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Test adding providers and broadcasting messages
