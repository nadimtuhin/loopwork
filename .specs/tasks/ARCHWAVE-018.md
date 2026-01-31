# ARCHWAVE-018: Implement IpcMessageBus

## Goal
Implement `IpcMessageBus` for communicating between the main process and plugin/worker processes. Use Bun's IPC capabilities or standard process.send/on('message').
## Files
- `packages/messaging/src/ipc-bus.ts`
- `packages/messaging/test/ipc-bus.test.ts`
## Dependencies
Depends on: ARCHWAVE-017
**Estimated Time:** 45-60 min
**Complexity:** ★★★★☆ (4/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Serialization failures for complex objects
- Process termination handling (cleanup listeners)
- Race conditions on startup

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Integration test spawning a child process and verifying message round-trip.
