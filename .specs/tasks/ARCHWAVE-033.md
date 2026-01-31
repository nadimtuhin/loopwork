# ARCHWAVE-033: Define UI Contracts

## Goal
Establish contracts for the UI rendering layer.

WHAT: Define `IRenderContext` and theme interfaces.
WHY: Allow swapping UI implementations (Ink vs console vs web) if needed.
HOW: Add `src/ui.ts` to `packages/contracts`.
ACCEPTANCE: Interfaces exported.
## Files
- `packages/contracts/src/ui.ts`
- `packages/contracts/src/index.ts`
**Estimated Time:** 15 min
**Complexity:** ★☆☆☆☆ (1/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Support for non-TTY environments

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Compile check.
