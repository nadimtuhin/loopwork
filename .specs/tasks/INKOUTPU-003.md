# INKOUTPU-003: Build Ink components for output primitives

## Goal
Create Ink versions of all output components from core/output.ts:

Acceptance Criteria:
- Create src/components/InkTable.tsx (Unicode box-drawing tables)
- Create src/components/InkBanner.tsx (startup/completion banners)
- Create src/components/InkLog.tsx (log message with timestamp and color)
- Create src/components/InkSpinner.tsx (loading spinner)
- Migrate existing ProgressBar.tsx to use event-based system
- Create src/components/InkStream.tsx for CLI subprocess output
- Add src/components/InkCompletionSummary.tsx for task stats

Implementation Hints:
- Use ink-box for borders and containers
- Use ink-spinner for loading animations
- Use ink-table or custom implementation for tables
- Preserve existing Unicode box-drawing characters for consistency
- Support color themes via chalk
- Make components stateless where possible (state in renderer)
- Reference existing dashboard components (CurrentTask, Stats, etc.)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
