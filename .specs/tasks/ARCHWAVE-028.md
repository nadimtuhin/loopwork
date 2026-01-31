# ARCHWAVE-028: Define Command Contracts

## Goal
Define the foundational interfaces for the CLI command system to enable decoupling from the core runner.

WHAT: Create `ICommand`, `ICommandRegistry`, and `CommandContext` interfaces.
WHY: To allow commands to be defined independently of the execution context.
HOW: Add `src/command.ts` to `@loopwork-ai/contracts`.
ACCEPTANCE: Interfaces exported and buildable.
## Files
- `packages/contracts/src/command.ts`
- `packages/contracts/src/index.ts`
**Estimated Time:** 15-30 min
**Complexity:** ★★☆☆☆ (2/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Ensure context includes necessary services like logger and config

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Verify type compilation; no runtime logic to test yet.
