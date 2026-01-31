# ARCHWAVE-071: Implement Markdown Changelog Logic

## Goal
Extract the changelog updating logic from DocumentationPlugin into a standalone class in doc-engine package implementing IChangeLogProvider.
## Files
- `packages/doc-engine/src/changelog-provider.ts`
- `packages/doc-engine/test/changelog.test.ts`
## Dependencies
Depends on: ARCHWAVE-070
**Estimated Time:** 45 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Empty changelog file
- Malformed existing changelog

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Unit test with mock file contents. Verify correct insertion of new entries.
