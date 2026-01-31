# INKTERMI-005: Migrate core commands to use Ink components

## Goal
Update all files that import from core/output.ts to use the new Ink-based components. This includes packages/loopwork/src/commands/*.ts and any other consumers. Use Ink's render() function to display components. Handle both interactive (render with live updates) and static (renderToString for CI/non-TTY) modes. Ensure backward compatibility by maintaining the same function signatures where possible. Update tests to work with the new rendering approach.

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
