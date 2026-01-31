# ARCHWAVE-073: Define Lifecycle Contracts

## Goal
Define IHeartbeatProvider and IHealthMonitor in contracts. These manage the loop's pulse and health status reporting.
## Files
- `packages/contracts/src/lifecycle.ts`
- `packages/contracts/src/index.ts`
**Estimated Time:** 15-30 min
**Complexity:** ★★☆☆☆ (2/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Defining what constitutes 'unhealthy' state

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Interface verification.
