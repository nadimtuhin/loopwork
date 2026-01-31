# ARCHWAVE-015: Define Messaging Contracts

## Goal
Create the interface definitions for the messaging system in the contracts package. This serves as the foundation for the decoupling effort. Define `IMessageBus` for general communication, `IEventBus` for pub/sub, and `InternalEvent` type structure.
## Files
- `packages/contracts/src/messaging.ts`
- `packages/contracts/src/index.ts`
**Estimated Time:** 20-30 min
**Complexity:** ★★☆☆☆ (2/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Ensure generic types for Event payloads are correctly propagated
- Handle wildcards in event topics if supported

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Verify TS compilation and type exports; ensure no circular dependencies.
