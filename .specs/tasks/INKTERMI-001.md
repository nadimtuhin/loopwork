# INKTERMI-001: Audit and document current output.ts API surface

## Goal
Create a comprehensive inventory of all exported functions and classes in packages/loopwork/src/core/output.ts (Table, Banner, ProgressBar, CompletionSummary, emoji utilities). Document their current parameters, return types, usage patterns across the codebase, and edge cases (TTY vs non-TTY, emoji fallbacks). This inventory will ensure the Ink rewrite maintains 100% API compatibility. Deliverable: A markdown document mapping each function to its contract and all call sites in the codebase.

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
