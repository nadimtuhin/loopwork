# ARCHWAVE-022: Migrate CostTracking to Telemetry Provider

## Goal
Refactor the logic from `packages/cost-tracking` to implement `ITelemetryProvider`. This effectively turns the cost tracker into a standard telemetry provider that the core can use generically.
## Files
- `packages/cost-tracking/src/provider.ts`
- `packages/cost-tracking/src/index.ts`
## Dependencies
Depends on: ARCHWAVE-021
**Estimated Time:** 45-60 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Preserving existing plugin configuration shape
- State persistence for accumulated costs

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Run cost-tracking tests ensuring they pass with the new interface wrapper.
