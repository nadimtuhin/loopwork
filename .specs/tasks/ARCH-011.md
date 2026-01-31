# ARCH-011: Update CLAUDE.md with new architecture

## Goal
Update CLAUDE.md to reflect new modular structure and DI patterns.

WHAT: Update project documentation to guide AI assistants on new package structure.

WHY: CLAUDE.md is critical for AI-assisted development. Must document new architecture.

HOW:
1. Update 'Monorepo Structure' section in CLAUDE.md:
   - Add new packages: contracts, common, state, plugin-registry, executor
   - Document dependency flow
2. Add 'Dependency Injection Patterns' section:
   - CliExecutor DI example
   - StateManager + IPersistenceLayer example
   - Testing with mocks example
3. Update 'Testing' section:
   - Document MemoryPersistenceLayer usage
   - Document MockProcessManager usage
   - Emphasize no filesystem side effects in tests
4. Update 'Common Development Tasks' section:
   - Add 'Working with Contracts' subsection
   - Add 'Creating Injectable Services' subsection
5. Update 'Architectural Guidelines & AI Safety':
   - Reinforce strict layering rules
   - Add examples of correct vs incorrect imports

ACCEPTANCE CRITERIA:
- CLAUDE.md accurately describes new structure
- Examples show proper DI usage
- AI Safety section updated with new anti-patterns

FILES: CLAUDE.md
## Files
- `CLAUDE.md`
## Dependencies
Depends on: ARCH-009, ARCH-010
**Estimated Time:** 30-45 min
**Complexity:** ★★☆☆☆ (2/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Keep existing CLAUDE.md sections intact - only update architecture parts
- Preserve examples from original doc where still valid

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Manual review. Ask another developer (or AI) to read and verify clarity.
