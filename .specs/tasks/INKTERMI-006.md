# INKTERMI-006: Deprecate legacy output.ts and update documentation

## Goal
Mark the old output.ts implementation as deprecated with clear migration notices. Update CLAUDE.md and any relevant documentation to reference the new Ink-based output system. Add migration guide showing before/after examples for each component. Run full test suite to ensure no regressions. Consider keeping legacy implementation behind a feature flag for one release cycle to allow gradual migration. Update TypeScript exports in packages/loopwork/src/index.ts to expose new Ink components.

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
