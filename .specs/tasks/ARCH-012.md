# ARCH-012: Run full build and integration test

## Goal
Execute complete build pipeline and E2E tests to verify refactor didn't break functionality.

WHAT: Run all builds, tests, and E2E scenarios to ensure system works end-to-end.

WHY: Final verification that refactor is complete and backward compatible.

HOW:
1. Clean build: 'bun run clean' (add script if needed: rm -rf packages/*/dist node_modules/.cache)
2. Fresh install: 'rm -rf node_modules packages/*/node_modules && bun install'
3. Build all: 'bun run build'
4. Test all: 'bun test' (root level)
5. Test specific packages:
   - 'bun --cwd packages/loopwork test'
   - 'bun --cwd packages/state test'
   - 'bun --cwd packages/executor test'
6. Run E2E test: 'bun --cwd packages/loopwork test test/e2e.test.ts'
7. Manual smoke test:
   - 'cd examples/basic-json-backend'
   - './quick-start.sh'
   - Verify task execution works
8. Check for regressions:
   - Compare test pass rate before/after refactor
   - Verify CLI still works: 'bun --cwd packages/loopwork run start --help'

ACCEPTANCE CRITERIA:
- All builds pass (packages/loopwork and new packages)
- Test pass rate >= 90% (or all 258 failures resolved)
- E2E test passes
- CLI smoke test works
- No runtime crashes or Segfaults

FILES: (no file changes, verification only)
## Dependencies
Depends on: ARCH-008, ARCH-010
**Estimated Time:** 30-45 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Flaky tests - re-run failing tests to confirm they're not transient
- Platform differences - test on macOS and Linux if possible
- Cache issues - clear Bun cache if strange build errors: 'bun pm cache rm'

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Execute all commands in sequence. Log output. If any step fails, diagnose and fix before proceeding.
