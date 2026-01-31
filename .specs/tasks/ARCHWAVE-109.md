# ARCHWAVE-109: Refactor Telegram & Discord Plugins

## Goal
Update `packages/telegram` and `packages/discord` to implement `INotificationProvider`. Ensure they can be registered with the CompositeProvider.
## Files
- `packages/telegram/src/index.ts`
- `packages/discord/src/index.ts`
## Dependencies
Depends on: ARCHWAVE-108
**Estimated Time:** 45 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Missing credentials handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Verify plugins still send messages using new interface
