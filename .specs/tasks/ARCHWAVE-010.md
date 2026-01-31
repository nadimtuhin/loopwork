# ARCHWAVE-010: Extract Risk Analysis & Confirmation

## Goal
Move risk analysis and confirmation logic to `@loopwork-ai/safety`. 

Deliverables:
- `packages/safety/src/risk-evaluator.ts`: Logic to assess command risk.
- `packages/safety/src/interactive-confirmation.ts`: TUI logic for asking permission.

Acceptance Criteria:
- Decoupled from specific CLI runner implementation.
## Files
- `packages/safety/src/risk-evaluator.ts`
- `packages/safety/src/interactive-confirmation.ts`
## Dependencies
Depends on: ARCHWAVE-009
**Estimated Time:** 45 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Non-interactive environments

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Unit tests for risk scoring logic
