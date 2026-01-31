# ARCHWAVE-104: Define Isolation Contracts

## Goal
Define `IIsolationProvider`, `ISandbox`, and `SandboxLimits` in contracts. These define how commands are executed in isolated environments.
## Files
- `packages/contracts/src/isolation.ts`
- `packages/contracts/src/index.ts`
## Dependencies
Depends on: ARCHWAVE-103
**Estimated Time:** 20 min
**Complexity:** ★★☆☆☆ (2/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Define stream handling (stdout/stderr) in contract

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Type check
