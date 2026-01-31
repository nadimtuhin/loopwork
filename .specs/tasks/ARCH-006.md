# ARCH-006: Refactor @loopwork-ai/loopwork as composition root

## Goal
Update main loopwork package to import from new modular packages and act as composition root.

WHAT: Transform loopwork package from monolithic implementation to thin composition layer that wires everything together.

WHY: After extraction, loopwork package should focus on: CLI entry point, config composition, plugin bundling, and initialization logic.

HOW:
1. Update packages/loopwork/package.json:
   - Add dependencies: '@loopwork-ai/contracts', '@loopwork-ai/common', '@loopwork-ai/state', '@loopwork-ai/plugin-registry', '@loopwork-ai/executor'
   - Remove version constraints (use 'workspace:*')
2. Delete moved files from packages/loopwork/src/:
   - src/contracts/* (moved to contracts package)
   - src/core/utils.ts (logger moved to common, keep UI exports)
   - src/core/state.ts, src/core/loopwork-state.ts (moved to state)
   - src/core/capability-registry.ts (moved to plugin-registry)
   - src/core/cli.ts, src/core/model-selector.ts (moved to executor)
   - src/core/spawners/* (moved to executor)
   - src/core/isolation/* (moved to executor)
3. Update packages/loopwork/src/index.ts:
   - Change all imports to use new package names
   - Re-export types: 'export type { ... } from '@loopwork-ai/contracts''
   - Re-export classes: 'export { CliExecutor } from '@loopwork-ai/executor''
   - Keep backward compatibility exports for API users
4. Update packages/loopwork/src/commands/*.ts:
   - Import from new packages instead of relative paths
   - Fix all broken imports in run.ts, status.ts, etc.
5. Update packages/loopwork/src/plugins/index.ts:
   - Remove plugins singleton (create registry in run command instead)
   - Keep plugin factory exports (withJSONBackend, etc.)
6. Create packages/loopwork/src/core/composition.ts:
   - Function to wire dependencies: createLoopworkRuntime(config)
   - Returns: { executor, stateManager, pluginRegistry, backend }
   - Handles DI setup for all components

ACCEPTANCE CRITERIA:
- bun install resolves all new dependencies
- bun run build passes (no TypeScript errors)
- All imports updated (no relative '../' to moved files)
- Exports backward compatible (existing users don't break)

FILES: packages/loopwork/package.json, packages/loopwork/src/index.ts, packages/loopwork/src/core/composition.ts, packages/loopwork/src/commands/*.ts
## Files
- `packages/loopwork/package.json`
- `packages/loopwork/src/index.ts`
- `packages/loopwork/src/core/composition.ts`
- `packages/loopwork/src/commands/run.ts`
- `packages/loopwork/src/commands/status.ts`
- `packages/loopwork/src/plugins/index.ts`
## Dependencies
Depends on: ARCH-005
**Estimated Time:** 60-90 min
**Complexity:** ★★★★★ (5/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Circular dependency detection - run 'bun pm ls' to check for cycles
- Export conflicts - ensure no duplicate exports from multiple packages
- Type imports - verify all 'export type' syntax used correctly
- Workspace resolution - Bun must resolve 'workspace:*' correctly

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Run 'bun run build' in packages/loopwork/. Run existing E2E test: packages/loopwork/test/e2e.test.ts. Verify 'bun run start' still works.
