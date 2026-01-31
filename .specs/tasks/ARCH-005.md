# ARCH-005: Create @loopwork-ai/executor package with CliExecutor

## Goal
Extract CliExecutor, ModelSelector, and WorkerPoolManager into executor package with dependency injection.

WHAT: Create executor package containing CLI execution engine with all model selection, retry, and isolation logic.

WHY: CliExecutor is core logic but currently tightly coupled to globals. Need clean DI for testability.

HOW:
1. Create packages/executor/ directory
2. Create package.json depending on contracts, common, state, and plugin-registry
3. Move packages/loopwork/src/core/cli.ts to packages/executor/src/cli-executor.ts
4. Move packages/loopwork/src/core/model-selector.ts to packages/executor/src/model-selector.ts
5. Move packages/loopwork/src/core/isolation/ to packages/executor/src/isolation/
6. Update CliExecutor constructor to accept:
   - config: CliExecutorConfig
   - processManager: IProcessManager
   - pluginRegistry: IPluginRegistry (remove global import)
   - logger: ILogger
7. Remove direct import of 'plugins' singleton from cli.ts (use injected registry)
8. Keep spawner logic (createSpawner from src/core/spawners)
9. Move spawners to packages/executor/src/spawners/
10. Export { CliExecutor, ModelSelector, WorkerPoolManager, createSpawner }

ACCEPTANCE CRITERIA:
- CliExecutor constructor uses DI (no global imports)
- Can execute task with mocked IProcessManager
- Model selection and retry logic intact
- bun test passes with full integration test

FILES: packages/executor/src/cli-executor.ts, packages/executor/src/model-selector.ts, packages/executor/src/isolation/WorkerPoolManager.ts, packages/executor/src/spawners/
## Files
- `packages/executor/package.json`
- `packages/executor/tsconfig.json`
- `packages/executor/src/cli-executor.ts`
- `packages/executor/src/model-selector.ts`
- `packages/executor/src/isolation/WorkerPoolManager.ts`
- `packages/executor/src/spawners/index.ts`
- `packages/executor/src/spawners/pty-spawner.ts`
- `packages/executor/src/spawners/standard-spawner.ts`
- `packages/executor/src/index.ts`
- `packages/executor/test/cli-executor.test.ts`
## Dependencies
Depends on: ARCH-003, ARCH-004
**Estimated Time:** 60-90 min
**Complexity:** ★★★★★ (5/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Model pool exhaustion - all models fail, verify error handling
- Rate limit backoff - ensure calculateBackoffDelay() works correctly
- Process timeout - verify SIGTERM then SIGKILL sequence
- Memory checks - getAvailableMemoryMB() on different platforms (macOS vm_stat, Linux free)
- Debugger integration - ensure PrePromptEvent emission works with mocked debugger

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Integration test: Mock IProcessManager.spawn(), inject into CliExecutor, execute task, verify model selection and retry. Test rate limit handling and timeout scenarios.
