# ARCH-010: Verify no circular dependencies

## Goal
Run dependency graph analysis to ensure clean layering and no cycles.

WHAT: Verify the dependency graph follows: contracts → common → (state, registry) → executor → loopwork.

WHY: Circular dependencies cause runtime crashes in Bun due to module initialization order issues.

HOW:
1. Install madge (if not available): 'bun add -D madge'
2. Run: 'bunx madge --circular packages/*/src'
3. Fix any reported cycles:
   - Move shared types to contracts
   - Extract circular imports into separate interface file
4. Create dependency diagram:
   - Use madge: 'bunx madge --image graph.png packages/*/src'
   - Add to packages/loopwork/docs/ARCHITECTURE.md
5. Add pre-commit hook (if desired) to check for cycles

ACCEPTANCE CRITERIA:
- madge reports zero circular dependencies
- Dependency graph matches expected layering
- All packages build without Segfault errors

FILES: .madge-ignore (if needed), packages/loopwork/docs/ARCHITECTURE.md
## Files
- `.madge-ignore`
- `packages/loopwork/docs/ARCHITECTURE.md`
## Dependencies
Depends on: ARCH-006
**Estimated Time:** 20-30 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Type-only imports - madge may report false positives for 'import type'
- Workspace aliases - ensure madge understands '@loopwork-ai/*' imports
- Dev dependencies - exclude test files from analysis

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Run 'bunx madge --circular packages/*/src'. If cycles found, trace imports and refactor. Re-run until clean.
