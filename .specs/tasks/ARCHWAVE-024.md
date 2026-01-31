# ARCHWAVE-024: Extract Config Logic

## Goal
Move `compose()`, `defineConfig()`, and configuration resolution logic from `packages/loopwork` to `@loopwork-ai/config-engine`. Implement a Zod-based validator.
## Files
- `packages/config-engine/src/compose.ts`
- `packages/config-engine/src/validator.ts`
- `packages/loopwork/src/config/utils.ts`
## Dependencies
Depends on: ARCHWAVE-023
**Estimated Time:** 60 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Deep merging of config objects
- Handling undefined/optional config sections
- Circular plugin dependencies (if any)

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Unit tests for `compose` ensuring plugin hooks are correctly merged.
