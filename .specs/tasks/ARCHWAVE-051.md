# ARCHWAVE-051: Inject AgentRegistry into Core Commands

## Goal
Refactor `packages/loopwork` commands to use the new `AgentRegistry` instead of hardcoded agent logic. 

HOW: Update `DecomposeCommand` and `RunCommand` to accept an injected registry. Remove legacy inline logic.

WHY: Completes the extraction and enables swapping agents via config.
## Files
- `packages/loopwork/src/commands/decompose.ts`
- `packages/loopwork/src/commands/run.ts`
- `packages/loopwork/package.json`
## Dependencies
Depends on: ARCHWAVE-050
**Estimated Time:** 30-45 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Backward compatibility with existing config

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Manual verification of `loopwork run` command
