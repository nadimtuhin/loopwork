# ARCHWAVE-056: Define Spec Parser Contracts

## Goal
Define interfaces for parsing task specifications. `IPrdParser`, `ITaskDefinition`, `ValidationSchema`.

HOW: Add to `contracts`. `IPrdParser` takes string/buffer and returns `ITaskDefinition`.

WHY: Decouple parsing logic from storage backends.
## Files
- `packages/contracts/src/spec.ts`
**Estimated Time:** 20 min
**Complexity:** ★★☆☆☆ (2/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Invalid markdown structures

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Type checks
