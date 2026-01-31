# ARCHWAVE-004: Implement Embedding Providers

## Goal
Implement `OpenAIEmbeddingProvider` and `GeminiEmbeddingProvider` in the new package.

Deliverables:
- `packages/vector-store/src/providers/openai.ts`
- `packages/vector-store/src/providers/gemini.ts`

Acceptance Criteria:
- Both classes implement `IEmbeddingProvider`.
- Error handling for API failures.
## Files
- `packages/vector-store/src/providers/openai.ts`
- `packages/vector-store/src/providers/gemini.ts`
## Dependencies
Depends on: ARCHWAVE-002
**Estimated Time:** 30 min
**Complexity:** ★★☆☆☆ (2/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Rate limits
- API timeouts

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Mock API calls to verify request format and response parsing
