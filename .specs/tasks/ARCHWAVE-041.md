# ARCHWAVE-041: Migrate Smart Tasks Logic

## Goal
Move the task suggestion logic.

WHAT: Port `smart-tasks.ts` to the new plugin.
WHY: Isolate generative task features.
HOW: Move code. Ensure config interface is exported.
ACCEPTANCE: Tests pass.
## Files
- `packages/plugin-smart-tasks/src/index.ts`
- `packages/plugin-smart-tasks/test/smart-tasks.test.ts`
## Dependencies
Depends on: ARCHWAVE-040
**Estimated Time:** 30 min
**Complexity:** ★★☆☆☆ (2/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Malformed JSON from LLM

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Verify prompt generation and task parsing.
