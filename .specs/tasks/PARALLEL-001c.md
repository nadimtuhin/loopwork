# PARALLEL-001c: Parallel: Add claimTask() to TaskBackend interface

## Goal
Add optional claimTask?(options?: FindTaskOptions): Promise<Task | null> to TaskBackend interface in contracts/backend.ts. Add JSDoc explaining atomic find + mark in-progress behavior.

## Requirements
- Add optional method to TaskBackend interface
- JSDoc explaining atomic semantics
- Prevents race conditions in parallel execution

## Success Criteria
- [ ] Interface compiles
- [ ] Documentation explains atomic behavior
