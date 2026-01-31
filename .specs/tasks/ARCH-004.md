# ARCH-004: Create @loopwork-ai/plugin-registry package

## Goal
Extract PluginRegistry logic into standalone package without bundled plugins.

WHAT: Create registry package that manages plugin lifecycle and capabilities, but doesn't include plugin implementations.

WHY: Current plugins/index.ts bundles all plugins causing circular dependency risks. Registry should be pure orchestration logic.

HOW:
1. Create packages/plugin-registry/ directory
2. Create package.json depending on '@loopwork-ai/contracts' and '@loopwork-ai/common'
3. Define IPluginRegistry interface in contracts (if not exists):
   - register(plugin: LoopworkPlugin): void
   - getPlugins(): LoopworkPlugin[]
   - emit(hook: string, ...args: any[]): Promise<void>
4. Move packages/loopwork/src/core/capability-registry.ts to packages/plugin-registry/src/capability-registry.ts
5. Create PluginRegistry class in packages/plugin-registry/src/registry.ts
6. Remove 'plugins' singleton from packages/loopwork/src/plugins/index.ts (this will be handled by loopwork main)
7. Implement plugin lifecycle methods: onConfigLoad, onBackendReady, onLoopStart, etc.
8. Export { PluginRegistry, createPluginRegistry, CapabilityRegistry }

ACCEPTANCE CRITERIA:
- PluginRegistry does NOT import any concrete plugin implementations
- Can register and emit to plugins via interface
- No global state (no singleton)
- bun test passes with mock plugins

FILES: packages/plugin-registry/src/registry.ts, packages/plugin-registry/src/capability-registry.ts, packages/plugin-registry/test/registry.test.ts
## Files
- `packages/plugin-registry/package.json`
- `packages/plugin-registry/tsconfig.json`
- `packages/plugin-registry/src/registry.ts`
- `packages/plugin-registry/src/capability-registry.ts`
- `packages/plugin-registry/src/index.ts`
- `packages/plugin-registry/test/registry.test.ts`
## Dependencies
Depends on: ARCH-001, ARCH-002
**Estimated Time:** 30-45 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Plugin hook errors - should not crash registry (error handling)
- Async hooks - ensure await Promise.all() for parallel execution
- Plugin order - hooks should execute in registration order
- Empty plugin list - registry should work with zero plugins

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Unit test: Register mock plugin, emit onTaskStart hook, verify plugin method was called. Test capability registry add/get/list operations.
