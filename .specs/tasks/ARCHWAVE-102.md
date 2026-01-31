# ARCHWAVE-102: Integrate Orchestrator into Monitor/Dashboard

## Goal
Refactor `Monitor` and `Dashboard` services in core/dashboard packages to use the `INamespaceManager` interface instead of direct filesystem access or ad-hoc logic.
## Files
- `packages/loopwork/src/core/monitor.ts`
- `packages/dashboard/src/server/api.ts`
## Dependencies
Depends on: ARCHWAVE-100, ARCHWAVE-101
**Estimated Time:** 45 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Backward compatibility with existing state files

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Integration test ensuring dashboard still lists namespaces correctly
