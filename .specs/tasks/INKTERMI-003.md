# INKTERMI-003: Create Ink-based Banner and ProgressBar components

## Goal
Rewrite Banner and ProgressBar from output.ts as Ink components. Banner should support key-value pairs, centered titles, and box-drawing. ProgressBar should support both determinate (percentage-based) and indeterminate (spinner) modes, with throttling to prevent excessive re-renders. Use Ink's built-in components (Box, Text) and possibly ink-spinner for indeterminate mode. Ensure emoji support with fallback detection. Add tests for various terminal widths and TTY modes.

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
