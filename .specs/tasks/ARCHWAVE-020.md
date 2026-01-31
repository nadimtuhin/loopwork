# ARCHWAVE-020: Define Telemetry Contracts

## Goal
Define `ITelemetryProvider`, `IMetricsCollector`, and `StructuredLog` interfaces in contracts. This decouples specific logging/tracking implementations from the core.
## Files
- `packages/contracts/src/telemetry.ts`
- `packages/contracts/src/index.ts`
**Estimated Time:** 20-30 min
**Complexity:** ★★☆☆☆ (2/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
TS compilation check.
