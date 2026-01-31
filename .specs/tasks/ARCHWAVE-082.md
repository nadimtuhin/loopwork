# ARCHWAVE-082: Define CLI Detection Contracts

## Goal
Create the interface definitions for CLI detection to establish the contract between the core and the new detector package. Define `ICliDetector` for finding binaries and `IBinaryInfo` for describing found CLIs.
## Files
- `packages/contracts/src/cli.ts`
- `packages/contracts/src/index.ts`
**Estimated Time:** 15-30 min
**Complexity:** ★★☆☆☆ (2/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Verify types compile and are exported correctly
