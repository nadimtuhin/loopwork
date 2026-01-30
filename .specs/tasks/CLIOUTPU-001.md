# CLIOUTPU-001: Create unified output utilities module

## Goal
Create a centralized output utilities module at `packages/loopwork/src/core/output.ts` that consolidates all output formatting.

**Requirements:**
- Create `Table` class with Unicode box-drawing support (similar to kill.ts pattern)
- Create `Separator` utility with standardized types: 'light' (─), 'heavy' (═), 'section' (newline-padded)
- Create `Banner` component for startup/completion messages
- Add `logger.raw()` method for cases where formatting needs to be bypassed
- Add emoji fallback detection (check terminal capability, fall back to ASCII like [OK], [ERR])
- Export all utilities alongside existing logger

**Acceptance Criteria:**
- Table class renders properly with variable column widths
- All separator types render consistently
- Banner supports title + key-value pairs
- Unit tests cover all new utilities
- Existing logger remains backward-compatible

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
