# ARCHWAVE-043: Integrate Specialized Plugins

## Goal
Update main config to use extracted plugins.

WHAT: Update `packages/loopwork` to import these new plugins.
WHY: Re-assemble the system via composition.
HOW: Update `package.json` deps and `src/index.ts` exports/composition.
ACCEPTANCE: System boots with all plugins active.
## Files
- `packages/loopwork/package.json`
- `packages/loopwork/src/index.ts`
## Dependencies
Depends on: ARCHWAVE-039, ARCHWAVE-041, ARCHWAVE-042
**Estimated Time:** 30 min
**Complexity:** ★★☆☆☆ (2/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Plugin load order

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Integration test: Run loopwork with a config using these plugins.
