# CLIOUTPU-006: Improve error display with codes and formatting

## Goal
Enhance error handling with consistent formatting and error codes.

**Error Code System:**
- Add error codes to LoopworkError: `ERR_LOCK_CONFLICT`, `ERR_CONFIG_INVALID`, etc.
- Create error code registry in core/errors.ts
- Include code in error display

**Error Display Improvements:**
- Consistent multi-line format for all errors
- Box-draw around critical errors
- Clear separation between error message, code, suggestions, and docs URL
- Color coding: red for message, yellow for suggestions, blue for docs

**Format Example:**
```
╭─ ERROR ────────────────────────────────────────────╮
│ ERR_LOCK_CONFLICT: Failed to acquire state lock    │
├────────────────────────────────────────────────────┤
│ 💡 Wait for other instance to finish               │
│ 💡 Or manually remove: rm .loopwork/loopwork.lock  │
│ 📚 https://docs.loopwork.ai/errors/lock           │
╰────────────────────────────────────────────────────╯
```

**Acceptance Criteria:**
- All existing errors have error codes assigned
- handleError() uses new consistent format
- Error codes documented in error registry
- Tests verify error display format

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
