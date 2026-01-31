# EXTRACTI-018: Migrate Ink Components

## Goal
Move all `.tsx` components and `InkRenderer` to the UI package. Ensure they depend only on contracts/types, not core implementation.
## Files
- `packages/ui/src/components/Banner.tsx`
- `packages/ui/src/renderer.tsx`
- `packages/loopwork/src/ui/`
## Dependencies
Depends on: EXTRACTI-017
**Estimated Time:** 60 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Terminal resize handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Visual regression check (manual) or snapshot testing.
