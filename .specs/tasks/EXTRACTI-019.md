# EXTRACTI-019: Define Plugin Registry Interfaces

## Goal
Define `IPluginRegistry` and `ILoopworkPlugin` in contracts. This breaks the circular dependency chain.
## Files
- `packages/contracts/src/plugin/index.ts`
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
Verify interfaces encompass all current plugin hooks.
