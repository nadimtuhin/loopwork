# ARCHWAVE-049: Scaffold @loopwork-ai/agents Package

## Goal
Initialize the new `packages/agents` workspace. Set up `package.json` with correct Bun configuration, `tsconfig.json` extending root base, and `src/index.ts`. Add dependency on `@loopwork-ai/contracts`.

HOW: Standard Bun workspace setup. Ensure `name` is scoped correctly. Set `sideEffects: false`.
## Files
- `packages/agents/package.json`
- `packages/agents/tsconfig.json`
- `packages/agents/src/index.ts`
## Dependencies
Depends on: ARCHWAVE-048
**Estimated Time:** 15 min
**Complexity:** ★☆☆☆☆ (1/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Circular dependencies with core

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Run `bun install` and verify workspace linking
