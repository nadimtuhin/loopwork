# CLIOUTPU-002: Standardize output method across all commands

## Goal
Refactor all commands to use the unified logger/output utilities instead of mixed approaches.

**Current Issues:**
- run.ts uses `logger.info()`
- status command (index.ts) uses `process.stdout.write()` directly
- decompose.ts and kill.ts use `console.log()` for tables

**Changes Required:**
- Convert all `console.log()` calls to use logger methods
- Convert all `process.stdout.write()` to logger methods
- Use new Table utility in kill.ts and decompose.ts
- Use new Banner utility in run.ts, init.ts
- Use standardized separators across all commands

**Files to modify:**
- packages/loopwork/src/index.ts (status command)
- packages/loopwork/src/commands/run.ts
- packages/loopwork/src/commands/init.ts
- packages/loopwork/src/commands/kill.ts
- packages/loopwork/src/commands/decompose.ts
- packages/loopwork/src/commands/logs.ts

**Acceptance Criteria:**
- No direct console.log/stdout.write in command files
- All tables use Table utility
- All banners use Banner utility
- Separators are semantically consistent

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
