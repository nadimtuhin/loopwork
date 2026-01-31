# ARCHWAVE-042: Create & Migrate Git Autocommit Plugin

## Goal
Extract the git auto-commit functionality.

WHAT: Create `@loopwork-ai/plugin-git-autocommit` and move logic.
WHY: Git logic shouldn't be in core.
HOW: Setup package, move `git-autocommit.ts` logic. This includes both scaffolding and implementation.
ACCEPTANCE: Plugin works independently.
## Files
- `packages/plugin-git-autocommit/package.json`
- `packages/plugin-git-autocommit/src/index.ts`
- `packages/plugin-git-autocommit/test/git.test.ts`
**Estimated Time:** 45 min
**Complexity:** ★★☆☆☆ (2/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- No changes to commit
- Git lock file errors

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Mock simple-git or shell execution.
