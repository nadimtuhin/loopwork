# ARCH-013: Create migration guide for external users

## Goal
Document breaking changes and migration steps for users upgrading from v0.3.x to v0.4.0.

WHAT: Create MIGRATION.md guide for users who depend on @loopwork-ai/loopwork package.

WHY: Modularization may break some import paths for advanced users who import internals.

HOW:
1. Create packages/loopwork/MIGRATION.md
2. Document breaking changes:
   - Direct imports from 'loopwork/src/*' no longer work
   - Import paths for contracts, utils, etc. changed
3. Provide migration examples:
   - OLD: import { StateManager } from '@loopwork-ai/loopwork/src/core/state'
   - NEW: import { StateManager } from '@loopwork-ai/state'
4. List backward-compatible exports:
   - All public API still exported from '@loopwork-ai/loopwork'
   - Config composition functions unchanged
5. Document new DI patterns for plugin authors:
   - How to use IPluginRegistry in plugins
   - How to test plugins with mocks
6. Add upgrade steps:
   - Update package.json dependencies
   - Fix imports
   - Run tests
7. Update CHANGELOG.md with v0.4.0 section:
   - BREAKING CHANGES
   - New Features (modular packages)
   - Bug Fixes (test isolation)

ACCEPTANCE CRITERIA:
- MIGRATION.md is clear and comprehensive
- CHANGELOG.md updated
- Breaking changes documented with examples

FILES: packages/loopwork/MIGRATION.md, CHANGELOG.md
## Files
- `packages/loopwork/MIGRATION.md`
- `CHANGELOG.md`
## Dependencies
Depends on: ARCH-011
**Estimated Time:** 20-30 min
**Complexity:** ★★☆☆☆ (2/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Semver - decide if this is 0.4.0 (breaking) or 1.0.0 (major)
- Deprecation warnings - consider adding console.warn for old imports

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Manual review. Have another developer follow migration steps with a test project.
