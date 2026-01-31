# ARCHWAVE-089: Integrate Model Registry into Core

## Goal
Update `CliExecutor` and `ModelSelector` in core to use `IModelRegistry`. Update `withCli` plugin to allow configuring the registry. Ensure backward compatibility with existing string-based model selection by resolving against the registry.
## Files
- `packages/loopwork/src/core/model-selector.ts`
- `packages/loopwork/src/plugins/cli.ts`
## Dependencies
Depends on: ARCHWAVE-088
**Estimated Time:** 45-60 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Integration test: Select model by alias and verify correct definition is used
