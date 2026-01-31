# ARCHWAVE-059: Integrate Parser into JSON Backend

## Goal
Update `JsonTaskAdapter` to use the new `IPrdParser` implementation.

HOW: Inject the parser into the backend constructor or use the default. Remove legacy parsing code.

WHY: Consumes the new package.
## Files
- `packages/loopwork/src/backends/json.ts`
## Dependencies
Depends on: ARCHWAVE-058
**Estimated Time:** 30 min
**Complexity:** ★★☆☆☆ (2/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Backward compatibility

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Run existing backend tests
