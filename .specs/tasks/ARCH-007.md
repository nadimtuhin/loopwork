# ARCH-007: Update root workspace configuration

## Goal
Update monorepo root package.json to include new packages in workspace array.

WHAT: Add new packages to Bun workspace configuration and update build scripts.

WHY: Bun needs to know about new packages for dependency resolution and parallel builds.

HOW:
1. Update root package.json workspaces array (should already include 'packages/*')
2. Verify Bun workspace detection: 'bun pm ls' should show all packages
3. Update turbo.json (if exists) to include new packages in build pipeline
4. Add build:contracts, build:common, etc. tasks if needed
5. Test workspace resolution: 'cd packages/loopwork && bun install' should link local packages

ACCEPTANCE CRITERIA:
- bun pm ls shows all 6 packages (loopwork + 5 new)
- bun install at root resolves all workspace dependencies
- bun run build (root) builds all packages in correct order

FILES: package.json, turbo.json (if exists)
## Files
- `package.json`
- `turbo.json`
## Dependencies
Depends on: ARCH-006
**Estimated Time:** 15-20 min
**Complexity:** ★☆☆☆☆ (1/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Turbo cache - may need to clear cache after structural changes
- Nested workspaces - ensure packages/dashboard/web doesn't conflict

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Run 'bun install' at root. Run 'bun pm ls' and verify package count. Run 'bun run build' and check for errors.
