# ARCHWAVE-017: Implement LocalEventBus

## Goal
Implement `LocalEventBus` in the messaging package. This should wrap Node.js `EventEmitter` (polyfilled in Bun) but expose the strict `IEventBus` interface. Ensure typed event emission and handling.
## Files
- `packages/messaging/src/local-bus.ts`
- `packages/messaging/test/local-bus.test.ts`
## Dependencies
Depends on: ARCHWAVE-016
**Estimated Time:** 30-45 min
**Complexity:** ★★☆☆☆ (2/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Memory leaks from forgotten listeners
- Error handling within event listeners not crashing the bus

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Unit tests ensuring events emitted are received by subscribers; test unsubscription logic.
