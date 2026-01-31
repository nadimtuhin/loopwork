# EXTRACTI-005: Implement Process Manager Orchestrator

## Goal
Implement the concrete `ProcessManager` class in the new package. It should coordinate the registry, spawners, and detectors. Expose as the main entry point of the package.
## Files
- `packages/process-manager/src/manager.ts`
- `packages/process-manager/src/index.ts`
## Dependencies
Depends on: EXTRACTI-004
**Estimated Time:** 45 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Process crash handling during initialization

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Integration test spawning a dummy process and verifying registry update.
