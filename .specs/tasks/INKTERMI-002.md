# INKTERMI-002: Create Ink-based Table component

## Goal
Rewrite the Table class from output.ts as a React/Ink component. Support all current features: flexible column widths, text alignment (left/center/right), header rows, dynamic data rows, unicode box-drawing (using Ink's Box component or ink-table library). Ensure it renders identically to the current implementation in both TTY and non-TTY environments. Include prop types for headers, rows, alignment options. Add unit tests comparing output snapshots with the legacy implementation.

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
