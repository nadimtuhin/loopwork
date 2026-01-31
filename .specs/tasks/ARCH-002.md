# ARCH-002: Create @loopwork-ai/common package with Logger abstraction

## Goal
Extract shared utilities and create Logger interface to decouple from Ink UI components.

WHAT: Create common package with Logger interface, basic utilities, and shared helpers.

WHY: Logger is used everywhere but currently tightly coupled to Ink. Abstracting it enables testing without UI dependencies.

HOW:
1. Create packages/common/ directory structure
2. Create package.json depending on '@loopwork-ai/contracts'
3. Define ILogger interface in contracts (add to TASK-001 if not done)
4. Extract logger class from packages/loopwork/src/core/utils.ts
5. Split utils.ts: Keep logger-related code, move UI exports elsewhere
6. Create ConsoleLogger implementation in common/src/logger.ts
7. Extract pure utility functions (file path helpers, validation, etc.) to common/src/utils.ts
8. Export { logger, ConsoleLogger, ...utils } from common/src/index.ts

ACCEPTANCE CRITERIA:
- Logger implements ILogger interface from contracts
- No dependency on 'ink' package in common
- bun test passes (add basic logger test)
- All exports use proper type syntax

FILES: packages/common/package.json, packages/common/src/logger.ts, packages/common/src/utils.ts, packages/common/src/index.ts
## Files
- `packages/common/package.json`
- `packages/common/tsconfig.json`
- `packages/common/src/logger.ts`
- `packages/common/src/utils.ts`
- `packages/common/src/index.ts`
- `packages/common/test/logger.test.ts`
## Dependencies
Depends on: ARCH-001
**Estimated Time:** 30-45 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Logger.update() for same-line updates - may need special handling without Ink
- Color support - use chalk directly, not Ink color wrappers
- Log level filtering - ensure setLogLevel() works correctly

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Unit test Logger.info(), Logger.error(), etc. Mock console output. Verify no Ink dependency with 'bun pm ls'.
