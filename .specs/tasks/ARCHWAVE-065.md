# ARCHWAVE-065: Define Visualization Contracts

## Goal
Define the IGraphRenderer and IDependencyVisualizer interfaces in the contracts package. This establishes the contract for graph visualization (like Mermaid diagrams) and dependency tracking visualization without tying it to a concrete implementation.
## Files
- `packages/contracts/src/visualization.ts`
- `packages/contracts/src/index.ts`
**Estimated Time:** 15-30 min
**Complexity:** ★★☆☆☆ (2/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Ensure generic support for different node types if necessary.

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Verify interfaces export correct types and are strictly typed.
