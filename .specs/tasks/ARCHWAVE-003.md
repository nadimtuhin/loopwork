# ARCHWAVE-003: Implement LocalVectorStore

## Goal
Implement a file-system based vector store in the new package implementing `IVectorStore`.

Deliverables:
- `packages/vector-store/src/local-store.ts`: Implementation class.
- Uses simple JSON serialization or a lightweight local vector lib for now.

Acceptance Criteria:
- Implements all methods of `IVectorStore`.
- Unit tests pass for adding and searching documents.
## Files
- `packages/vector-store/src/local-store.ts`
- `packages/vector-store/test/local-store.test.ts`
## Dependencies
Depends on: ARCHWAVE-002
**Estimated Time:** 45 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Concurrent writes to local store
- Empty store searches

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Unit test adding docs and retrieving by similarity using mock embeddings
