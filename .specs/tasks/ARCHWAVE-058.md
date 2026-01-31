# ARCHWAVE-058: Extract Markdown Parsing Logic

## Goal
Move the PRD parsing logic (regex, section extraction) from `JsonTaskAdapter` to this new package.

HOW: Refactor the parsing code into a pure function/class `MarkdownPrdParser`. Implement validation against the schema.

WHY: Make parsing reusable for GitHub issues or other backends.
## Files
- `packages/spec-parser/src/markdown.ts`
- `packages/spec-parser/src/validator.ts`
## Dependencies
Depends on: ARCHWAVE-057
**Estimated Time:** 45 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Missing sections
- Empty files
- Malicious content

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Unit tests with various PRD examples (valid/invalid)
