# ARCH-008: Fix test imports and update test suite

## Goal
Update all test files to import from new packages and fix broken tests.

WHAT: Fix imports in packages/loopwork/test/ and ensure tests use new DI patterns.

WHY: Tests currently import from old relative paths. After refactor, they need to use new package imports and mocks.

HOW:
1. Audit all test files in packages/loopwork/test/
2. Update imports:
   - Change: import { StateManager } from '../src/core/state'
   - To: import { StateManager } from '@loopwork-ai/state'
3. For tests requiring mocks:
   - Use MemoryPersistenceLayer instead of real files
   - Use MockProcessManager (already exists) instead of real spawning
   - Inject mocks via constructors (DI pattern)
4. Fix tests in new packages:
   - packages/contracts/test/ (if any)
   - packages/common/test/logger.test.ts
   - packages/state/test/state-manager.test.ts
   - packages/plugin-registry/test/registry.test.ts
   - packages/executor/test/cli-executor.test.ts
5. Update test:all script in root package.json to run tests in all packages

ACCEPTANCE CRITERIA:
- bun test (root) runs all tests across all packages
- All 258 previously failing tests now pass or have clear failure reason
- No tests write to real filesystem (all use mocks)
- Test coverage maintained or improved

FILES: packages/loopwork/test/*.test.ts, packages/*/test/*.test.ts
## Files
- `packages/loopwork/test/e2e.test.ts`
- `packages/loopwork/test/backends.test.ts`
- `packages/loopwork/test/parallel-runner.test.ts`
- `packages/common/test/logger.test.ts`
- `packages/state/test/state-manager.test.ts`
- `packages/plugin-registry/test/registry.test.ts`
- `packages/executor/test/cli-executor.test.ts`
## Dependencies
Depends on: ARCH-006
**Estimated Time:** 60-90 min
**Complexity:** ★★★★☆ (4/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Test timeouts - increase timeout in bunfig.toml if needed
- Mock cleanup - ensure beforeEach/afterEach hooks reset mocks
- Async test issues - verify all Promises are awaited
- Test isolation - tests should not depend on execution order

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Run 'bun test' in each package individually first. Then run 'bun run test' at root. Fix each failing test by checking import paths and ensuring mocks are used.
