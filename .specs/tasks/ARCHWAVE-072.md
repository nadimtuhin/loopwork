# ARCHWAVE-072: Inject Doc Engine into DocumentationPlugin

## Goal
Refactor DocumentationPlugin to accept IDocGenerator/IChangeLogProvider in its constructor. Update the plugin factory to inject the new implementation.
## Files
- `packages/loopwork/src/plugins/documentation.ts`
- `packages/loopwork/src/index.ts`
## Dependencies
Depends on: ARCHWAVE-071
**Estimated Time:** 30 min
**Complexity:** ★★★☆☆ (3/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Ensure backward compatibility with existing config options

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Verify plugin still generates docs correctly via existing plugin tests.
