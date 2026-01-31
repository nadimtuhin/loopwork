# ARCHWAVE-088: Migrate Model Presets and Registry Logic

## Goal
Move existing `ModelPresets` constant and `createModel` factory logic from `loopwork` core to this new package. Implement `StaticModelRegistry` class satisfying `IModelRegistry`. Add methods to get models by alias or ID.
## Files
- `packages/model-registry/src/registry.ts`
- `packages/model-registry/src/presets.ts`
- `packages/model-registry/test/registry.test.ts`
## Dependencies
Depends on: ARCHWAVE-087
**Estimated Time:** 45-60 min
**Complexity:** ★★☆☆☆ (2/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Unknown model ID
- Duplicate aliases

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Unit tests ensuring all default presets are retrievable and cost metadata is correct
