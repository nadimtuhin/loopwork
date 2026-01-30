# CLIOUTPU-003: Add progress bar and completion summary components

## Goal
Create reusable progress and completion components for consistent feedback.

**Progress Bar:**
- Create `ProgressBar` class in output utilities
- Support total/current tracking
- Support indeterminate mode (spinner-like)
- Auto-detect TTY and disable in non-interactive mode
- Methods: `tick(message)`, `increment()`, `complete(message)`

**Completion Summary:**
- Create `CompletionSummary` class
- Support stats display (completed/failed/skipped counts)
- Support duration display
- Support 'next steps' suggestions
- Consistent format across all commands

**Integration Points:**
- run.ts: Use for iteration progress and final summary
- init.ts: Use for completion message with next steps
- decompose.ts: Use for task creation progress
- kill.ts: Use for orphan cleanup summary

**Acceptance Criteria:**
- Progress bar works smoothly in TTY mode
- Graceful degradation in non-TTY mode
- Completion summary has consistent styling
- All commands with multi-step operations use progress bar

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
