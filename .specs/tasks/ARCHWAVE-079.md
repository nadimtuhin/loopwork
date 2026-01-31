# ARCHWAVE-079: Implement Centralized Error Registry

## Goal
Create the CentralErrorRegistry class. Move all hardcoded error codes and messages here. Implement logic to look up guidance URLs based on error codes.
## Files
- `packages/error-service/src/registry.ts`
- `packages/error-service/test/registry.test.ts`
## Dependencies
Depends on: ARCHWAVE-078
**Estimated Time:** 45 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Unknown error codes

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Verify all error codes resolve to messages. Verify URL generation.
