# ARCHWAVE-068: Integrate Visualizer into Status Command

## Goal
Refactor the 'status' and 'dashboard' commands in the loopwork core package to use the new MermaidGraphRenderer via Dependency Injection. Remove the hardcoded implementation.
## Files
- `packages/loopwork/src/cli/commands/status.ts`
- `packages/loopwork/src/index.ts`
## Dependencies
Depends on: ARCHWAVE-067
**Estimated Time:** 30-45 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Missing visualizer injection (should fail gracefully or use default)

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Run status command and verify output matches previous format. Integration test.
