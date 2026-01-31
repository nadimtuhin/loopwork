# ARCHWAVE-030: Extract Reschedule Command

## Goal
Move the task rescheduling logic to the new commands package.

WHAT: Implement `RescheduleCommand` class implementing `ICommand`.
WHY: Isolate rescheduling logic from the main CLI entry point.
HOW: Copy logic from `packages/loopwork/src/cli.ts` (or relevant file) to `packages/cli-commands/src/reschedule.ts`. Adapt to use `CommandContext`.
ACCEPTANCE: Unit tests pass for the command controller.
## Files
- `packages/cli-commands/src/reschedule.ts`
- `packages/cli-commands/test/reschedule.test.ts`
## Dependencies
Depends on: ARCHWAVE-029
**Estimated Time:** 30-45 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Handle missing task IDs
- Handle IO errors during state update

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Mock CommandContext and verify reschedule logic updates state correctly.
