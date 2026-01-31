# ARCHWAVE-060: Define Pipeline Contracts

## Goal
Define `IPipeline`, `IHookMiddleware`, and `PipelineContext` for the new hook engine.

HOW: Add to `contracts`. Define the `next()` function signature for middleware.

WHY: Enables Koa/Express-style composition of plugins.
## Files
- `packages/contracts/src/pipeline.ts`
**Estimated Time:** 30 min
**Complexity:** ★★☆☆☆ (2/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Async middleware error propagation

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Type checks
