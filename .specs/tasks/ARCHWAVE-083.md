# ARCHWAVE-083: Create CLI Detector Package

## Goal
Initialize the `@loopwork-ai/cli-detector` package with necessary boilerplate. Include `package.json` with correct name and exports, `tsconfig.json` extending root base, and an empty `src/index.ts`. Ensure it depends on `@loopwork-ai/contracts`.
## Files
- `packages/cli-detector/package.json`
- `packages/cli-detector/tsconfig.json`
- `packages/cli-detector/src/index.ts`
## Dependencies
Depends on: ARCHWAVE-082
**Estimated Time:** 15-30 min
**Complexity:** ★☆☆☆☆ (1/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Verify package is recognized by Bun workspace and builds
