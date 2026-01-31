# ARCHWAVE-007: Migrate Analysis Logic

## Goal
Move existing analysis logic from `loopwork` core to new package, refactoring to implement interfaces.

Deliverables:
- `packages/analysis-engine/src/pattern-analyzer.ts`: Regex/heuristic analysis.
- `packages/analysis-engine/src/llm-analyzer.ts`: LLM-based analysis.

Acceptance Criteria:
- Logic matches original implementation but adheres to `IAnalysisEngine`.
- No dependencies on core loopwork state.
## Files
- `packages/analysis-engine/src/pattern-analyzer.ts`
- `packages/analysis-engine/src/llm-analyzer.ts`
## Dependencies
Depends on: ARCHWAVE-006
**Estimated Time:** 45 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- LLM failure fallbacks

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Unit tests porting existing tests from core
