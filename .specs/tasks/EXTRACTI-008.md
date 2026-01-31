# EXTRACTI-008: Define State Persistence Contracts

## Goal
Define `IPersistenceLayer` (raw storage) and `IStateManager` (business logic) interfaces in `contracts`. Enable swapping backend storage (File, Redis, etc.).
## Files
- `packages/contracts/src/state/index.ts`
- `packages/contracts/src/state/persistence.ts`
**Estimated Time:** 30 min
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
Interface compilation check.
