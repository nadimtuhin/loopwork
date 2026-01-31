# ARCHWAVE-011: Define Adapter Contracts

## Goal
Define interfaces for external tool runners.

Deliverables:
- `packages/contracts/src/adapters.ts`: `IRunnerAdapter`, `IGitAdapter`, `IBrowserAdapter`.

Acceptance Criteria:
- Generic interfaces allowing for different implementations (e.g., shell vs node-git).
## Files
- `packages/contracts/src/adapters.ts`
**Estimated Time:** 20 min
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
Compile check
