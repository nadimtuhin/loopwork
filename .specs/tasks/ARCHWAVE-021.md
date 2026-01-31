# ARCHWAVE-021: Scaffold Telemetry Package & Basic Collector

## Goal
Create `@loopwork-ai/telemetry`. Implement `ConsoleMetricsCollector` as a basic implementation of `IMetricsCollector`.
## Files
- `packages/telemetry/package.json`
- `packages/telemetry/src/index.ts`
- `packages/telemetry/src/console-collector.ts`
## Dependencies
Depends on: ARCHWAVE-020
**Estimated Time:** 30-45 min
**Complexity:** ★★☆☆☆ (2/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- High volume logging performance
- Formatting of nested objects

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Unit test verifying collector methods write to stdout/stderr correctly.
