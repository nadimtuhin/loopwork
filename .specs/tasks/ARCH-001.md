# ARCH-001: Create @loopwork-ai/contracts package foundation

## Goal
Create the base package structure for @loopwork-ai/contracts with all pure TypeScript interfaces and types.

WHAT: Extract all interfaces from packages/loopwork/src/contracts/ into a standalone, zero-dependency package.

WHY: Contracts must be the foundation layer with no implementation dependencies to prevent circular imports and enable clean dependency injection.

HOW:
1. Create packages/contracts/ directory
2. Create package.json with name '@loopwork-ai/contracts', version '0.1.0'
3. Create tsconfig.json extending Bun's bundler config
4. Copy ALL files from packages/loopwork/src/contracts/ to packages/contracts/src/
5. Create packages/contracts/src/index.ts that re-exports all types using 'export type' (CRITICAL for Bun ESM)
6. Remove any implementation imports (e.g., src/core/retry.ts imports should move)
7. Verify zero runtime dependencies in package.json

ACCEPTANCE CRITERIA:
- bun install works in packages/contracts/
- bun run build passes (no-emit TypeScript check)
- No dependencies in package.json (only devDependencies)
- All exports use 'export type { ... }' syntax

FILES: packages/contracts/package.json, packages/contracts/tsconfig.json, packages/contracts/src/index.ts, packages/contracts/src/*.ts (all contract files)
## Files
- `packages/contracts/package.json`
- `packages/contracts/tsconfig.json`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/task.ts`
- `packages/contracts/src/backend.ts`
- `packages/contracts/src/plugin.ts`
- `packages/contracts/src/config.ts`
- `packages/contracts/src/cli.ts`
- `packages/contracts/src/state.ts`
- `packages/contracts/src/executor.ts`
- `packages/contracts/src/spawner.ts`
- `packages/contracts/src/process-manager.ts`
**Estimated Time:** 30-45 min
**Complexity:** ★★☆☆☆ (2/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Contracts importing from '../core' (e.g., retry.ts) - move those types into contracts
- DEFAULT_CONFIG and other const exports - these are values, not types, but are needed
- Ensure no circular references within contracts package itself

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Run 'bun run build' to verify TypeScript compilation. Check exports manually for 'export type' syntax.
