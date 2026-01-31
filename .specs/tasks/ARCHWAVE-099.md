# ARCHWAVE-099: Define Orchestration Contracts

## Goal
Define `INamespaceManager`, `ICoordinator`, and `ClusterState` interfaces in the contracts package. These interfaces will govern how namespaces are listed, locked, and cleaned up.
## Files
- `packages/contracts/src/orchestration.ts`
- `packages/contracts/src/index.ts`
## Dependencies
Depends on: ARCHWAVE-098
**Estimated Time:** 20 min
**Complexity:** ★★☆☆☆ (2/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Ensure ClusterState is serializable

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Type check only
