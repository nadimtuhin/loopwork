# EXTRACTI-001: Define Process Management Contracts

## Goal
Create strict interfaces for process management to decouple implementation details. Refine `IProcessManager` and `ISpawner` in the contracts package. Ensure zero dependencies on concrete implementations. Define supporting types `ProcessInfo`, `SpawnOptions`, `KillOptions`.
## Files
- `packages/contracts/src/process/index.ts`
- `packages/contracts/src/process/types.ts`
- `packages/contracts/package.json`
**Estimated Time:** 30-45 min
**Complexity:** ★★☆☆☆ (2/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Circular type dependencies
- Bun vs Node process type compatibility

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Verify interface types export correctly; Ensure no runtime imports in type definitions.
