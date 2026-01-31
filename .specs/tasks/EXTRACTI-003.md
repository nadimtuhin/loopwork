# EXTRACTI-003: Migrate Process Registry & Detector

## Goal
Move `ProcessRegistry` and `OrphanDetector` to the new package. Refactor to inject `IPersistence` for state management instead of direct file access. Remove dependencies on global config or state.
## Files
- `packages/process-manager/src/registry.ts`
- `packages/process-manager/src/orphan-detector.ts`
- `packages/loopwork/src/core/process/registry.ts`
## Dependencies
Depends on: EXTRACTI-002
**Estimated Time:** 45-60 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Race conditions in registry updates
- Orphan detection false positives

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Unit tests for Registry using in-memory persistence mock.
