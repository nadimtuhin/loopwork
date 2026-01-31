# ARCH-003: Create @loopwork-ai/state package with IPersistenceLayer

## Goal
Extract StateManager and implement persistence interface for dependency injection.

WHAT: Create state package with StateManager class that accepts IPersistenceLayer interface.

WHY: StateManager currently hardcodes 'fs' module, making it impossible to test without real files. DI enables mocking.

HOW:
1. Create packages/state/ directory
2. Create package.json depending on '@loopwork-ai/contracts' and '@loopwork-ai/common'
3. Define IPersistenceLayer interface in contracts:
   - readFile(path: string): Promise<string>
   - writeFile(path: string, data: string): Promise<void>
   - exists(path: string): Promise<boolean>
   - mkdir(path: string): Promise<void>
4. Move packages/loopwork/src/core/state.ts to packages/state/src/state-manager.ts
5. Move packages/loopwork/src/core/loopwork-state.ts to packages/state/src/loopwork-state.ts
6. Refactor StateManager constructor to accept IPersistenceLayer parameter
7. Create FilePersistenceLayer implementation wrapping Node.js 'fs' module
8. Create MemoryPersistenceLayer for testing (in-memory Map)
9. Update all fs calls in StateManager to use this.persistence interface

ACCEPTANCE CRITERIA:
- StateManager accepts IPersistenceLayer in constructor
- FilePersistenceLayer wraps all fs operations
- MemoryPersistenceLayer works for tests (no real files)
- bun test passes with mocked persistence

FILES: packages/state/src/state-manager.ts, packages/state/src/loopwork-state.ts, packages/state/src/persistence/file.ts, packages/state/src/persistence/memory.ts
## Files
- `packages/state/package.json`
- `packages/state/tsconfig.json`
- `packages/state/src/state-manager.ts`
- `packages/state/src/loopwork-state.ts`
- `packages/state/src/persistence/file.ts`
- `packages/state/src/persistence/memory.ts`
- `packages/state/src/index.ts`
- `packages/state/test/state-manager.test.ts`
## Dependencies
Depends on: ARCH-001, ARCH-002
**Estimated Time:** 45-60 min
**Complexity:** ★★★★☆ (4/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Lock file handling - needs special persistence methods (createLock, removeLock)
- Process PID checks - may need to mock process.kill() for lock validation
- Namespace-specific paths - ensure path resolution works with mock persistence
- Stale lock detection - handle timing issues in tests

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Integration test: Create StateManager with MemoryPersistenceLayer, save state, load state, verify data. No files should be created on disk during test.
