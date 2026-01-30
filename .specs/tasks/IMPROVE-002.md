# IMPROVE-002: Update README examples to use @loopwork-ai scope

## Goal
Update all documentation to consistently use the `@loopwork-ai` package scope instead of `@loopwork`.

## Current State
The README and other docs may have outdated examples using `@loopwork/*` package names.

## Files to Update
- `/README.md` - Main project README
- `/packages/loopwork/README.md` - Core package README
- `/CONTRIBUTING.md` - Contributor guide
- Any other documentation files with package references

## Requirements
- [ ] Search all documentation for `@loopwork/` references
- [ ] Update to `@loopwork-ai/` where applicable
- [ ] Update installation examples:
  ```bash
  bun add @loopwork-ai/cost-tracking
  bun add @loopwork-ai/telegram
  ```
- [ ] Update import examples:
  ```typescript
  import { withTelegram } from '@loopwork-ai/telegram'
  ```
- [ ] Verify all examples are accurate
- [ ] Check for any broken links

## Acceptance Criteria
- No remaining `@loopwork/` references in documentation (except in changelogs/history)
- All installation and import examples use correct scope
- Documentation builds/renders correctly

## Notes
- May need to preserve old scope in changelogs for historical accuracy
- Focus on user-facing documentation
