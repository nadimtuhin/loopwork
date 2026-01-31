# ARCHWAVE-001: Define Vector Store Contracts

## Goal
Create strict interface definitions for Vector Store components in the contracts package. This establishes the abstraction layer before implementation.

Deliverables:
- `packages/contracts/src/vector-store.ts`: Define `IVectorStore`, `IEmbeddingProvider`, `VectorDocument`, and `VectorSearchResult`.
- Export these types in `packages/contracts/src/index.ts` using `export type`.

Interfaces should support:
- `IVectorStore`: `addDocuments`, `similaritySearch`, `deleteDocuments`.
- `IEmbeddingProvider`: `embedQuery`, `embedDocuments`.

Acceptance Criteria:
- Types compile successfully.
- No concrete implementations imported.
## Files
- `packages/contracts/src/vector-store.ts`
- `packages/contracts/src/index.ts`
**Estimated Time:** 20 min
**Complexity:** ★★☆☆☆ (2/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Ensure types handle different vector dimensions and metadata generic types

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Compile-time check only
